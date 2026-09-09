import { Container, Graphics, RenderLayer } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../core/ReelSetBuilder.js';
import type { Direction, Orientation } from '../core/ReelAxis.js';
import type { ReelSet } from '../core/ReelSet.js';
import { SharedRectMaskStrategy } from '../core/ReelViewport.js';
import type { MaskStrategy } from '../core/ReelViewport.js';
import type { MaskCorners } from '../core/maskStrategies.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { EmptySymbol } from '../symbols/EmptySymbol.js';
import { SpeedPresets } from '../config/SpeedPresets.js';
import type { SpeedProfile, SymbolData, SymbolZIndexResolver } from '../config/types.js';
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

/** What a cell-mask factory is told about the cell it builds for. */
export interface BoardCellMaskInfo {
  cols: number;
  rows: number;
  /**
   * The BOARD corners this cell sits on: `{ topLeft: true }` and the rest
   * `false` for cell `(0, 0)`, all `false` for an inner cell. Hand it to
   * `RoundedRectMaskStrategy` as `corners` and the board reads as one rounded
   * window built from one rect per cell.
   */
  corners: MaskCorners;
}

/** A speed profile, or a per-cell function of one (e.g. a stagger wave). */
export type BoardProfile = SpeedProfile | ((cell: BoardCell) => SpeedProfile);

/** What a {@link BoardCellZIndexResolver} is asked about. */
export interface BoardCellZIndexContext {
  /** Id currently shown in the cell. */
  symbolId: string;
  /** The board coordinate - what a per-symbol resolver cannot supply, since every cell is reel 0 of its own set. */
  cell: BoardCell;
  cols: number;
  rows: number;
  /** `false` while the cell's own strip is in flight. */
  atRest: boolean;
  /** The cell's attach index (column-major); returning it reproduces the default order. */
  attachOrder: number;
}

/**
 * Orders the cells' lifted art. See the `cellZIndex` option of
 * {@link BoardGridOptions}.
 */
export type BoardCellZIndexResolver = (ctx: BoardCellZIndexContext) => number;

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
   * Mask for each cell, built once per cell (every cell is its own reel set
   * and owns its mask). Default: a shared rect over the cell. Hand it
   * `() => new RoundedRectMaskStrategy({ radius })` for cells whose art and
   * frame have rounded corners. The factory is told which cell it builds for
   * and which board corners that cell sits on, so
   * `(_, { corners }) => new RoundedRectMaskStrategy({ radius, corners })`
   * rounds only the board's outer corners and keeps every other cell square.
   */
  mask?: (cell: BoardCell, info: BoardCellMaskInfo) => MaskStrategy;
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
  /**
   * Per-symbol z-index resolver, exactly like `ReelSetBuilder.symbolZIndex`,
   * applied to every cell's reel set. Orders symbols INSIDE a cell; for the
   * order between cells see `cellZIndex`.
   */
  symbolZIndex?: SymbolZIndexResolver;
  /**
   * Draw order of the cells' lifted art - the `unmask: true` symbols the
   * engine lifts above each cell's mask at rest, which the grid renders in one
   * shared layer above every cell. Without this the layer draws in attach
   * order (column-major), so a lower cell's overflowing art is covered by the
   * next column's. Provided, the layer sorts by the value returned for each
   * cell, re-asked whenever any cell's symbol changes (place, landing).
   * `ctx.attachOrder` reproduces the default.
   */
  cellZIndex?: BoardCellZIndexResolver;
}

/** Which of the board's four screen corners `cell` sits on. */
function boardCorners(cell: BoardCell, cols: number, rows: number): MaskCorners {
  const left = cell.reel === 0;
  const right = cell.reel === cols - 1;
  const top = cell.cell === 0;
  const bottom = cell.cell === rows - 1;
  return {
    topLeft: left && top,
    topRight: right && top,
    bottomLeft: left && bottom,
    bottomRight: right && bottom,
  };
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
  /**
   * Every cell's `viewport.unmaskedContainer`, rendered here - above ALL
   * cells - instead of inside its own reel set. Each cell is its own display
   * subtree, so a symbol the engine lifts above its cell's mask (`unmask:
   * true`, at rest) would otherwise still sit below every later cell's
   * chrome and blank symbol, and art that overflows the cell is cut along
   * the neighbour's edge.
   */
  private readonly _lifted: RenderLayer;
  /**
   * The lifted art of cells a consumer has {@link lift}ed, rendered above
   * `_lifted` - the transient exception to `cellZIndex`. Empty until someone
   * calls `lift()`, so a board that never does renders exactly as before.
   */
  private readonly _promoted: RenderLayer;
  /** Outstanding {@link lift} count per cell key, in lift order. */
  private readonly _liftCounts = new Map<string, number>();
  private readonly _cellZIndex: BoardCellZIndexResolver | null;
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

    // Chrome for every cell goes in first, then every reel, then the lifted
    // layer: nothing a cell draws may cover a neighbour's overflow.
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
      }
    }

    for (let reel = 0; reel < opts.cols; reel++) {
      for (let rowIdx = 0; rowIdx < opts.rows; rowIdx++) {
        const cell: BoardCell = { reel, cell: rowIdx };
        const origin = this._origin(cell);

        const builder = new ReelSetBuilder()
          .reels(1)
          .visibleCells(1)
          .symbolSize(this.cellWidth, this.cellHeight)
          .symbolGap(0, 0)
          // Spine symbols overrun the default per-reel rect mask; a shared rect
          // keeps buffer-cell art from painting over neighbouring cells.
          .maskStrategy(
            opts.mask
              ? opts.mask(cell, { cols: opts.cols, rows: opts.rows, corners: boardCorners(cell, opts.cols, opts.rows) })
              : new SharedRectMaskStrategy(),
          )
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
        if (opts.symbolZIndex) builder.symbolZIndex(opts.symbolZIndex);
        if (opts.rng) builder.rng(opts.rng);

        const reelSet = builder.build();
        reelSet.position.set(origin.x, origin.y);
        this.container.addChild(reelSet);
        this._reels.set(key(cell), reelSet);
        this._cells.push(cell);
      }
    }

    this._cellZIndex = opts.cellZIndex ?? null;
    // Sortable only when asked: the default `RenderLayer` sort is by
    // `zIndex`, and every cell container starts at 0, so sorting a board with
    // no resolver would still be attach order - at the cost of a sort per
    // frame the layer is marked dirty.
    this._lifted = new RenderLayer({ sortableChildren: this._cellZIndex !== null });
    this.container.addChild(this._lifted);
    for (const reelSet of this._reels.values()) {
      this._lifted.attach(reelSet.viewport.unmaskedContainer);
    }
    // Added after `_lifted`, so anything attached here draws above every
    // cell's at-rest art. Sorted on the same terms: two cells lifted at once
    // keep the order `cellZIndex` gave them.
    this._promoted = new RenderLayer({ sortableChildren: this._cellZIndex !== null });
    this.container.addChild(this._promoted);
    this.refreshCellZIndex();
  }

  /**
   * The layer every cell's lifted (`unmask: true`, at rest) art renders in,
   * above all cells. Escape hatch for an effect that must sit between the
   * cells and their lifted art, or above both; the `cellZIndex` option is the
   * supported way to order the cells themselves.
   */
  get liftedLayer(): RenderLayer {
    return this._lifted;
  }

  /**
   * Draw one cell's lifted art in front of every other cell's until the
   * returned function is called - the transient exception to the board's
   * at-rest order (`cellZIndex`). For a symbol whose one-shot must not be
   * overlapped by a neighbour's art: a coin upgrading in place, a collect
   * sweeping the board, a symbol firing at another cell.
   *
   * Promotion is a SEPARATE channel from `zIndex`, so a lift survives
   * {@link refreshCellZIndex} - which keeps writing the lifted cell's
   * `zIndex` throughout, ordering it for the moment it comes back - and
   * releasing restores the cell's place exactly, recomputing nothing.
   *
   * Lifts are reference-counted per cell and the returned release is
   * idempotent, so overlapping lifts of one cell cannot strand each other.
   * Several lifted cells keep their relative at-rest order.
   *
   * Scope: this promotes the cell's LIFTED art - the views the engine hoists
   * out of the cell for a symbol registered `unmask: true`, which is what the
   * board renders above all cells in the first place. A cell showing a masked
   * symbol has nothing in that layer, so lifting it is a no-op; masked art is
   * clipped to its own cell and cannot overlap a neighbour anyway.
   *
   * Lifting is presentation only: no ledger, no phase, no event. A lift held
   * across a respin is legal - the caller owns its own choreography - and is
   * released only by its own release, {@link destroy}, or (on a
   * `HoldAndWinBoard`) `reset()`.
   *
   * @example
   * ```ts
   * const release = board.lift(cell);
   * await board.symbolAt(cell).playWin();
   * release();
   * ```
   */
  lift(cell: BoardCell): () => void {
    // A feature can end while a reveal is still awaiting; a lift on a dead
    // board is a no-op rather than a crash. The coordinate check comes after,
    // so a destroyed board never reports a valid cell as out of range.
    if (this._destroyed) return () => {};
    const reelSet = this._reel(cell);
    const k = key(cell);
    const count = this._liftCounts.get(k) ?? 0;
    // Re-setting an existing key keeps its insertion order, so `liftedCells`
    // reports first-lift order rather than last-increment order.
    this._liftCounts.set(k, count + 1);
    if (count === 0) this._promoted.attach(reelSet.viewport.unmaskedContainer);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this._destroyed) return;
      const held = this._liftCounts.get(k) ?? 0;
      if (held <= 1) {
        this._liftCounts.delete(k);
        this._lifted.attach(reelSet.viewport.unmaskedContainer);
      } else {
        this._liftCounts.set(k, held - 1);
      }
    };
  }

  /** Currently lifted cells, in lift order. Debug / assertion surface. */
  get liftedCells(): BoardCell[] {
    return [...this._liftCounts.keys()].map((k) => {
      const [reel, cell] = k.split(',');
      return { reel: Number(reel), cell: Number(cell) };
    });
  }

  /**
   * Drop every outstanding lift at once, whatever its reference count.
   * Called by `reset()` and `destroy()` on a `HoldAndWinBoard`, so a feature
   * that ends mid-animation cannot leave a cell stuck in front. Releases
   * handed out before this stay safe to call - they become no-ops.
   */
  releaseAllLifts(): void {
    if (this._liftCounts.size === 0) return;
    for (const k of this._liftCounts.keys()) {
      const reelSet = this._reels.get(k);
      if (reelSet) this._lifted.attach(reelSet.viewport.unmaskedContainer);
    }
    this._liftCounts.clear();
  }

  /**
   * Re-ask the `cellZIndex` resolver for every cell and write the answers
   * onto the cells' lifted containers. Called on every `place` and every
   * cell landing; a no-op without a resolver. Fifteen property writes on a
   * 5x3 board, so the contract is unconditional rather than incremental.
   */
  refreshCellZIndex(): void {
    if (!this._cellZIndex || this._destroyed) return;
    this._cells.forEach((cell, attachOrder) => {
      const reelSet = this._reel(cell);
      reelSet.viewport.unmaskedContainer.zIndex = this._cellZIndex!({
        symbolId: reelSet.getReel(0).getVisibleSymbols()[0] ?? this.emptyId,
        cell,
        cols: this.cols,
        rows: this.rows,
        atRest: !reelSet.isSpinning,
        attachOrder,
      });
    });
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
    this.refreshCellZIndex();
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
        // Before `onLanded`, so the cell is already ordered when the game's
        // after-land presentation starts.
        this.refreshCellZIndex();
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
    this.releaseAllLifts();
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
