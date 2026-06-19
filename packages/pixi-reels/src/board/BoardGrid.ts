import { Container, Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../core/ReelSetBuilder.js';
import type { ReelSet } from '../core/ReelSet.js';
import { SharedRectMaskStrategy } from '../core/ReelViewport.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { EmptySymbol } from '../symbols/EmptySymbol.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
import type { Disposable } from '../utils/Disposable.js';

/** A cell coordinate in the grid. Structurally compatible with `HwCell`. */
export interface BoardCell {
  col: number;
  row: number;
}

/** A landing target: spin `cell` and stop it showing `id`. */
export interface BoardSpinTarget {
  cell: BoardCell;
  id: string;
}

export interface BoardGridConfig {
  cols: number;
  rows: number;
  cell: number;
  gap: number;
  /** Id a cell shows when blank — also placed in the off-window buffer slots. */
  emptyId: string;
  configurator: (registry: SymbolRegistry) => void;
  weights: Record<string, number> | null;
  symbolData: Record<string, Partial<SymbolData>> | null;
  /**
   * Named per-cell speed profiles. Each is registered on every cell's reel and
   * selected by name via {@link BoardGrid.setProfile}. The names are the
   * caller's vocabulary — this layer treats them opaquely.
   */
  profiles: Record<string, (cell: BoardCell) => SpeedProfile>;
  chrome: ((g: Graphics, size: number) => void) | null;
  ticker: Ticker;
  rng: (() => number) | null;
}

const key = (c: BoardCell): string => `${c.col},${c.row}`;

/**
 * A grid of cells that each spin **independently** — the generic "board of
 * reels" mechanism. Every cell is its own 1×1 {@link ReelSet}, so it inherits
 * the engine's phases, speed modes and pooling for free rather than a parallel
 * lighter reel.
 *
 * Deliberately mechanism-only: it knows nothing about coins, locks, respins or
 * anticipation. It lays the grid out, hands back per-cell geometry and live
 * symbol instances, places symbols instantly, and spins a **caller-chosen** set
 * of cells to caller-chosen results. The Hold & Win semantics live one layer up
 * in {@link HoldAndWinBoard}; this class is the seam a future public board API
 * would grow from.
 */
export class BoardGrid implements Disposable {
  readonly container: Container;
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;

  private readonly _cfg: BoardGridConfig;
  private readonly _reels = new Map<string, ReelSet>();
  private readonly _cells: BoardCell[] = [];
  private _destroyed = false;

  constructor(cfg: BoardGridConfig) {
    this._cfg = cfg;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.cellSize = cfg.cell;
    this.container = new Container();

    for (let col = 0; col < cfg.cols; col++) {
      for (let row = 0; row < cfg.rows; row++) {
        const cell: BoardCell = { col, row };
        const origin = this._origin(cell);
        if (cfg.chrome) {
          const bg = new Graphics();
          cfg.chrome(bg, cfg.cell);
          bg.position.set(origin.x, origin.y);
          this.container.addChild(bg);
        }

        const builder = new ReelSetBuilder()
          .reels(1)
          .visibleRows(1)
          .symbolSize(cfg.cell, cfg.cell)
          .symbolGap(0, 0)
          // Spine symbols overrun the default per-reel rect mask; a shared rect
          // keeps buffer-row art from painting over neighbouring cells.
          .maskStrategy(new SharedRectMaskStrategy())
          .symbols((registry) => {
            cfg.configurator(registry);
            if (!registry.has(cfg.emptyId)) registry.register(cfg.emptyId, EmptySymbol, {});
          })
          .initialFrame([
            { visible: [cfg.emptyId], bufferAbove: [cfg.emptyId], bufferBelow: [cfg.emptyId] },
          ])
          .ticker(cfg.ticker);
        for (const [name, factory] of Object.entries(cfg.profiles)) {
          builder.speed(name, factory(cell));
        }
        if (cfg.weights) builder.weights(cfg.weights);
        if (cfg.symbolData) builder.symbolData(cfg.symbolData);
        if (cfg.rng) builder.rng(cfg.rng);

        const reelSet = builder.build();
        reelSet.position.set(origin.x, origin.y);
        this.container.addChild(reelSet);
        this._reels.set(key(cell), reelSet);
        this._cells.push(cell);
      }
    }
  }

  /** Every cell coordinate, row-major. */
  cells(): BoardCell[] {
    return this._cells.map((c) => ({ col: c.col, row: c.row }));
  }

  /** Board-local bounds of a cell. `container.toGlobal` for stage space. */
  cellBounds(cell: BoardCell): { x: number; y: number; width: number; height: number } {
    const origin = this._origin(cell);
    return { x: origin.x, y: origin.y, width: this._cfg.cell, height: this._cfg.cell };
  }

  /** Board-local center of a cell — flight / trail start and end points. */
  cellCenter(cell: BoardCell): { x: number; y: number } {
    const origin = this._origin(cell);
    return { x: origin.x + this._cfg.cell / 2, y: origin.y + this._cfg.cell / 2 };
  }

  /** Live symbol instance currently shown in a cell. */
  symbolAt(cell: BoardCell): ReelSymbol {
    return this._reel(cell).getReel(0).getSymbolAt(0);
  }

  /** The cell's underlying 1×1 ReelSet, for driving one cell directly. */
  reelAt(cell: BoardCell): ReelSet {
    return this._reel(cell);
  }

  /** Select a registered speed profile by name for one cell. */
  setProfile(cell: BoardCell, name: string): void {
    this._reel(cell).speed.set(name);
  }

  /** Place a symbol instantly (no spin), with blank off-window buffers. */
  place(cell: BoardCell, id: string): void {
    // Negative-index addresses bufferAbove; index 1 the single bufferBelow.
    // Explicit empties keep the rest state from random-filling past the mask.
    const ids: string[] & Record<number, string> = [id];
    ids[-1] = this._cfg.emptyId;
    ids[1] = this._cfg.emptyId;
    this._reel(cell).getReel(0).placeSymbols(ids);
  }

  /**
   * Spin each target cell and stop it showing its `id`; `onLanded` fires per
   * cell as it settles, in stagger order. Resolves once the whole set lands.
   * The caller selects which cells spin and to what — this layer applies no
   * lock/free policy of its own. Set profiles via {@link setProfile} first.
   */
  async spinCells(
    targets: BoardSpinTarget[],
    onLanded: (cell: BoardCell, id: string) => void,
  ): Promise<void> {
    await Promise.all(
      targets.map(async ({ cell, id }) => {
        const reelSet = this._reel(cell);
        const settle = reelSet.spin();
        // Buffers land empty too: off-window art can paint over neighbours.
        reelSet.setResult([
          { visible: [id], bufferAbove: [this._cfg.emptyId], bufferBelow: [this._cfg.emptyId] },
        ]);
        await settle;
        onLanded(cell, id);
      }),
    );
  }

  /** Slam every in-flight cell to its landed position. Returns the count. */
  skipSpinning(): number {
    let inFlight = 0;
    for (const reelSet of this._reels.values()) {
      if (reelSet.isSpinning) {
        inFlight += 1;
        try {
          reelSet.skipSpin();
        } catch {
          /* result not provided yet — nothing to skip to; ignore */
        }
      }
    }
    return inFlight;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const reelSet of this._reels.values()) reelSet.destroy();
    this._reels.clear();
    this._cells.length = 0;
    this.container.destroy({ children: true });
  }

  private _origin(cell: BoardCell): { x: number; y: number } {
    return {
      x: cell.col * (this._cfg.cell + this._cfg.gap),
      y: cell.row * (this._cfg.cell + this._cfg.gap),
    };
  }

  private _reel(cell: BoardCell): ReelSet {
    const reelSet = this._reels.get(key(cell));
    if (!reelSet) {
      throw new Error(`BoardGrid: cell ${key(cell)} is outside the ${this.cols}x${this.rows} grid.`);
    }
    return reelSet;
  }
}
