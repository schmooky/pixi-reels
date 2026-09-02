import { Container, Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../core/ReelSetBuilder.js';
import type { Direction, Orientation } from '../core/ReelAxis.js';
import type { ReelSet } from '../core/ReelSet.js';
import { SharedRectMaskStrategy } from '../core/ReelViewport.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { EmptySymbol } from '../symbols/EmptySymbol.js';
import { SpeedPresets } from '../config/SpeedPresets.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
import type { Disposable } from '../utils/Disposable.js';

/** A cell coordinate in the grid. */
export interface BoardCell {
  reel: number;
  cell: number;
}

/** A landing target: spin `cell` and stop it showing `id`. */
export interface BoardSpinTarget {
  cell: BoardCell;
  id: string;
}

/** A speed profile, or a per-cell function of one (e.g. a stagger wave). */
export type BoardProfile = SpeedProfile | ((cell: BoardCell) => SpeedProfile);

export interface BoardGridOptions {
  /** Grid dimensions. */
  cols: number;
  rows: number;
  /** Cell size in pixels: one number for square cells, or `{ width, height }`. */
  cellSize: number | { width: number; height: number };
  /** Gap between cells on both axes. Default 4. */
  gap?: number;
  /** Horizontal gap between columns. Falls back to `gap`. */
  columnGap?: number;
  /** Vertical gap between rows. Falls back to `gap`. */
  rowGap?: number;
  /** Id a cell shows when blank - also placed in the off-window buffers. Default `'empty'`. */
  emptyId?: string;
  /** Register symbol classes, exactly like `ReelSetBuilder.symbols`. Applied to every cell. */
  symbols: (registry: SymbolRegistry) => void;
  /** Strip weights during the spin. */
  weights?: Record<string, number>;
  /** Per-symbol engine overrides, exactly like `ReelSetBuilder.symbolData`. */
  symbolData?: Record<string, Partial<SymbolData>>;
  /** Injected RNG for the spin strips (deterministic demos / tests). */
  rng?: () => number;
  /** Drives every cell's reel - required. */
  ticker: Ticker;
  /**
   * Per-cell background, drawn behind each reel, handed the cell's width and
   * height. A square-board callback that only reads the first size argument
   * keeps working unchanged.
   */
  chrome?: (g: Graphics, width: number, height: number) => void;
  /**
   * Which way each cell's own strip travels while it spins. Every cell is a
   * 1x1 reel set, so this changes the direction a symbol scrolls in from, not
   * the board layout - `cols` and `rows` stay board dimensions either way.
   * Defaults to the engine default (vertical / forward), i.e. symbols drop in
   * from above.
   */
  orientation?: Orientation;
  direction?: Direction;
  /**
   * Named speed profiles, each registered on every cell and selected by name
   * via {@link BoardGrid.setProfile}. A value may be a flat profile or a
   * per-cell function (for stagger waves). Defaults to a single `'default'`
   * profile, which is the active one until you `setProfile` otherwise.
   */
  profiles?: Record<string, BoardProfile>;
}

const key = (c: BoardCell): string => `${c.reel},${c.cell}`;
const DEFAULT_PROFILE = 'default';

/**
 * A grid of cells that each spin **independently** - the generic "board of
 * reels" primitive. Every cell is its own 1×1 {@link ReelSet}, so it inherits
 * the engine's phases, speed modes and pooling rather than a parallel lighter
 * reel.
 *
 * Deliberately mechanism-only: it knows nothing about coins, locks, respins,
 * value or any game rule. It lays the grid out, hands back per-cell geometry
 * and live symbol instances, places symbols instantly, and spins a
 * **caller-chosen** set of cells to caller-chosen results. Build your own
 * feature on top by owning the rules in your own code; {@link HoldAndWinBoard}
 * is one such opinionated layer, built entirely on this public surface.
 *
 * ```ts
 * const grid = new BoardGrid({
 *   cols: 3, rows: 3, cellSize: { width: 100, height: 84 }, columnGap: 6, rowGap: 0,
 *   symbols: (r) => r.register('prize', PrizeSymbol, {}),
 *   weights: { prize: 1, empty: 4 },
 *   ticker: app.ticker,
 * });
 * app.stage.addChild(grid.container);
 *
 * await grid.spinCells(
 *   grid.cells().map((cell) => ({ cell, id: pick() })),  // you decide each result
 *   (cell, id) => console.log('landed', cell, id),       // react as each settles
 * );
 * ```
 */
export class BoardGrid implements Disposable {
  readonly container: Container;
  readonly cols: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly emptyId: string;

  private readonly _reels = new Map<string, ReelSet>();
  private readonly _cells: BoardCell[] = [];
  private _destroyed = false;

  constructor(opts: BoardGridOptions) {
    if (!opts.ticker) throw new Error('BoardGrid: a ticker is required.');
    this.cols = opts.cols;
    this.rows = opts.rows;
    const size = typeof opts.cellSize === 'number'
      ? { width: opts.cellSize, height: opts.cellSize }
      : opts.cellSize;
    this.cellWidth = size.width;
    this.cellHeight = size.height;
    const gap = opts.gap ?? 4;
    this.columnGap = opts.columnGap ?? gap;
    this.rowGap = opts.rowGap ?? gap;
    this.emptyId = opts.emptyId ?? 'empty';
    this.container = new Container();

    const profiles: Record<string, BoardProfile> =
      opts.profiles && Object.keys(opts.profiles).length > 0
        ? opts.profiles
        : { [DEFAULT_PROFILE]: { ...SpeedPresets.NORMAL, minimumSpinTime: 320 } };
    const profileNames = Object.keys(profiles);
    const profileFor = (p: BoardProfile, cell: BoardCell): SpeedProfile =>
      typeof p === 'function' ? p(cell) : p;

    for (let reel = 0; reel < opts.cols; reel++) {
      for (let rowIdx = 0; rowIdx < opts.rows; rowIdx++) {
        const cell: BoardCell = { reel, cell: rowIdx };
        const origin = this._origin(cell);
        if (opts.chrome) {
          const bg = new Graphics();
          opts.chrome(bg, this.cellWidth, this.cellHeight);
          bg.position.set(origin.x, origin.y);
          this.container.addChild(bg);
        }

        const builder = new ReelSetBuilder()
          .reels(1)
          .visibleCells(1)
          .symbolSize(this.cellWidth, this.cellHeight)
          .symbolGap(0, 0)
          // Spine symbols overrun the default per-reel rect mask; a shared rect
          // keeps buffer-cell art from painting over neighbouring cells.
          .maskStrategy(new SharedRectMaskStrategy())
          .symbols((registry) => {
            opts.symbols(registry);
            if (!registry.has(this.emptyId)) registry.register(this.emptyId, EmptySymbol, {});
          })
          .initialFrame([
            { visible: [this.emptyId], bufferStart: [this.emptyId], bufferEnd: [this.emptyId] },
          ])
          .ticker(opts.ticker)
          .orientation(opts.orientation ?? 'vertical')
          .direction(opts.direction ?? 'forward')
          // The active profile defaults to the engine's 'normal'; point it at
          // the first registered name so any profile vocabulary works.
          .initialSpeed(profileNames[0]);
        for (const [name, profile] of Object.entries(profiles)) {
          builder.speed(name, profileFor(profile, cell));
        }
        if (opts.weights) builder.weights(opts.weights);
        if (opts.symbolData) builder.symbolData(opts.symbolData);
        if (opts.rng) builder.rng(opts.rng);

        const reelSet = builder.build();
        reelSet.position.set(origin.x, origin.y);
        this.container.addChild(reelSet);
        this._reels.set(key(cell), reelSet);
        this._cells.push(cell);
      }
    }
  }

  /**
   * Cell edge length. Only meaningful on a square board; a rectangular board
   * reports its width here.
   * @deprecated Read {@link cellWidth} / {@link cellHeight}.
   */
  get cellSize(): number {
    return this.cellWidth;
  }

  /**
   * Gap between cells. Only meaningful when both gaps agree; otherwise this is
   * the column gap.
   * @deprecated Read {@link columnGap} / {@link rowGap}.
   */
  get gap(): number {
    return this.columnGap;
  }

  /** Every cell coordinate, reel-major: (0,0), (0,1), ... then (1,0). */
  cells(): BoardCell[] {
    return this._cells.map((c) => ({ reel: c.reel, cell: c.cell }));
  }

  /** Board-local bounds of a cell. `container.toGlobal` for stage space. */
  cellBounds(cell: BoardCell): { x: number; y: number; width: number; height: number } {
    const origin = this._origin(cell);
    return { x: origin.x, y: origin.y, width: this.cellWidth, height: this.cellHeight };
  }

  /** Board-local center of a cell - flight / trail start and end points. */
  cellCenter(cell: BoardCell): { x: number; y: number } {
    const origin = this._origin(cell);
    return { x: origin.x + this.cellWidth / 2, y: origin.y + this.cellHeight / 2 };
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
    // Explicit empties in both buffers keep the rest state from
    // random-filling past the mask.
    this._reel(cell).getReel(0).placeSymbols({
      visible: [id],
      bufferStart: [this.emptyId],
      bufferEnd: [this.emptyId],
    });
  }

  /**
   * Spin each target cell and stop it showing its `id`; `onLanded` fires per
   * cell as it settles, in stagger order. The caller selects which cells spin
   * and to what - this layer applies no lock/free policy of its own. Set
   * profiles via {@link setProfile} first.
   *
   * `onLanded` may be **async**: if it returns a promise, that cell's task
   * awaits it, so the returned promise resolves only once every cell has landed
   * *and* its after-land work has finished. Cells still run concurrently, so an
   * early cell's reveal overlaps with later cells still spinning.
   */
  async spinCells(
    targets: BoardSpinTarget[],
    onLanded: (cell: BoardCell, id: string) => void | Promise<void> = () => {},
  ): Promise<void> {
    await Promise.all(
      targets.map(async ({ cell, id }) => {
        const reelSet = this._reel(cell);
        const settle = reelSet.spin();
        // Buffers land empty too: off-window art can paint over neighbours.
        reelSet.setResult([
          { visible: [id], bufferStart: [this.emptyId], bufferEnd: [this.emptyId] },
        ]);
        await settle;
        await onLanded(cell, id);
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
          /* result not provided yet - nothing to skip to; ignore */
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
      x: cell.reel * (this.cellWidth + this.columnGap),
      y: cell.cell * (this.cellHeight + this.rowGap),
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
