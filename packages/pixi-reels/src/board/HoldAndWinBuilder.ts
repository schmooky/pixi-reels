import type { Graphics, Ticker } from 'pixi.js';
import { SpeedPresets } from '../config/SpeedPresets.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { HoldAndWinBoard } from './HoldAndWinBoard.js';
import type { Direction, Orientation } from '../core/ReelAxis.js';
import type { MaskStrategy } from '../core/ReelViewport.js';
import type { HwCell, HwCellSizeOptions, HwLockAnimation } from './HwTypes.js';

/**
 * Fluent builder for {@link HoldAndWinBoard}.
 *
 * A Hold & Win board is a W×H grid of cells that spin **independently** - the
 * mechanic's atomic unit is the cell, the engine's is the column, so each cell
 * is its own 1×1 ReelSet. This builder wires that grid plus the round
 * choreography; everything value-shaped stays in the game layer (see
 * {@link HoldAndWinBoard}).
 *
 * `TData` types the opaque payload carried on each coin's `data`.
 */
export class HoldAndWinBuilder<TData = unknown> {
  private _cols = 5;
  private _rows = 3;
  private _cellWidth = 72;
  private _cellHeight = 72;
  private _columnGap = 4;
  private _rowGap = 4;
  private _emptyId = 'empty';
  private _inactive: HwCell[] = [];
  private _inactiveId: string | null = null;
  private _respins = 3;
  private _lockAnimation: HwLockAnimation = 'win';
  private _configurator: ((registry: SymbolRegistry) => void) | null = null;
  private _weights: Record<string, number> | null = null;
  private _symbolData: Record<string, Partial<SymbolData>> | null = null;
  private _speeds: Record<string, SpeedProfile> = { normal: { ...SpeedPresets.NORMAL, minimumSpinTime: 320 } };
  private _initialSpeed = 'normal';
  private _stagger: (reel: number, cell: number, speed: string) => number = (reel, cell) => (reel + cell) * 70;
  private _anticipateWhen:
    | ((state: { locked: number; capacity: number; respinsLeft: number }) => boolean)
    | null = null;
  private _chrome: ((g: Graphics, width: number, height: number) => void) | null = null;
  private _mask: (() => MaskStrategy) | null = null;
  private _orientation: Orientation = 'vertical';
  private _direction: Direction = 'forward';
  private _ticker: Ticker | null = null;
  private _rng: (() => number) | null = null;

  grid(cols: number, rows: number): this {
    this._cols = cols;
    this._rows = rows;
    return this;
  }

  /**
   * Cell size in pixels - one number for square cells, `{ width, height }` for
   * rectangular ones - plus the gaps between cells. `gap` sets both axes;
   * `columnGap` / `rowGap` override one each, so `{ columnGap: 6, rowGap: 0 }`
   * gives touching rows with a seam between columns.
   */
  cellSize(size: number | { width: number; height: number }, opts: HwCellSizeOptions = {}): this {
    if (typeof size === 'number') {
      this._cellWidth = size;
      this._cellHeight = size;
    } else {
      this._cellWidth = size.width;
      this._cellHeight = size.height;
    }
    if (opts.gap !== undefined) {
      this._columnGap = opts.gap;
      this._rowGap = opts.gap;
    }
    if (opts.columnGap !== undefined) this._columnGap = opts.columnGap;
    if (opts.rowGap !== undefined) this._rowGap = opts.rowGap;
    return this;
  }

  /**
   * Register coin symbol classes, exactly like `ReelSetBuilder.symbols`. Applied
   * to every cell. An {@link EmptySymbol} is auto-registered under {@link emptyId}
   * unless the configurator registers one itself.
   */
  symbols(configurator: (registry: SymbolRegistry) => void): this {
    this._configurator = configurator;
    return this;
  }

  /** Strip weights during the spin (how often coins flash past empties). */
  weights(weights: Record<string, number>): this {
    this._weights = weights;
    return this;
  }

  /** Symbol id a cell shows when it holds no coin. Default `'empty'`. */
  emptyId(id: string): this {
    this._emptyId = id;
    return this;
  }

  /**
   * Cells that are built but dormant: they never spin, never take a coin and
   * do not count toward the full board until {@link HoldAndWinBoard.activate}
   * wakes them. `id` is the symbol shown on a dormant cell (default: the empty
   * id) - register a distinct one to draw them as sealed. A board that grows
   * from 5x3 to 5x5 mid-feature is a 5x5 board with two inactive rows.
   */
  inactive(cells: HwCell[], id?: string): this {
    this._inactive = cells.map((c) => ({ reel: c.reel, cell: c.cell }));
    this._inactiveId = id ?? null;
    return this;
  }

  /**
   * Per-symbol engine overrides, exactly like `ReelSetBuilder.symbolData`. The
   * headline use is `{ unmask: true }` for coins whose art or lock/reveal
   * animation is drawn past the cell. The lift applies at rest only - the
   * engine re-masks a cell the moment it moves - so weighted strip ids are
   * fine too: they scroll clipped and sit unclipped once landed.
   */
  symbolData(overrides: Record<string, Partial<SymbolData>>): this {
    this._symbolData = { ...(this._symbolData ?? {}), ...overrides };
    return this;
  }

  /** Respins granted on enter and restored on every hit. Default 3. */
  respins(count: number): this {
    this._respins = count;
    return this;
  }

  /**
   * What a coin's symbol plays the moment it locks. Default `'win'` - the
   * symbol's `playWin()`. Pick `'landing'` for a land beat only and call
   * {@link HoldAndWinBoard.playWin} when the game wants the celebration, or
   * `'none'` to drive presentation entirely from the events.
   */
  lockAnimation(mode: HwLockAnimation): this {
    this._lockAnimation = mode;
    return this;
  }

  /**
   * The `'normal'` spin feel for every cell. Default: NORMAL with a 320ms
   * floor. Shorthand for `speeds({ normal: profile })`.
   */
  speedProfile(profile: SpeedProfile): this {
    this._speeds = { ...this._speeds, normal: profile };
    return this;
  }

  /**
   * Named speed profiles, registered into EVERY cell's SpeedManager - the
   * board's `speed.addProfile()`. `board.setSpeed(name)` then switches all
   * cells at once, exactly like `reelSet.setSpeed()` on one reel set. Merges
   * with what is already registered (`'normal'` by default).
   *
   * ```ts
   * .speeds({ normal: NORMAL, turbo: TURBO, superTurbo: SUPER_TURBO })
   * ```
   */
  speeds(profiles: Record<string, SpeedProfile>): this {
    this._speeds = { ...this._speeds, ...profiles };
    return this;
  }

  /** Profile active when the board is built. Default `'normal'`. */
  initialSpeed(name: string): this {
    this._initialSpeed = name;
    return this;
  }

  /**
   * Extra milliseconds of spin per cell on top of the active profile's
   * minimum spin time. Default `(reel + cell) * 70` - the diagonal landing
   * wave. The active speed's name is the third argument, so a turbo profile
   * can flatten the wave: `(reel, cell, speed) => speed === 'turbo' ? 0 : ...`.
   */
  stagger(fn: (reel: number, cell: number, speed: string) => number): this {
    this._stagger = fn;
    return this;
  }

  /**
   * When the predicate returns true for a wave, **every** spinning cell uses a
   * drawn-out tension profile - the "one cell left for Grand" moment. Evaluated
   * once per wave for the whole board (not per cell), against the pre-wave state.
   */
  anticipateWhen(
    fn: (state: { locked: number; capacity: number; respinsLeft: number }) => boolean,
  ): this {
    this._anticipateWhen = fn;
    return this;
  }

  /**
   * Per-cell background, drawn behind each mini reel, handed the cell's width
   * and height. A callback written for a square board that only reads the
   * first argument keeps working.
   */
  cellChrome(draw: (g: Graphics, width: number, height: number) => void): this {
    this._chrome = draw;
    return this;
  }

  /**
   * Mask for each cell, built once per cell. Default: a shared rect over the
   * cell. `() => new RoundedRectMaskStrategy({ radius: 8 })` rounds every
   * cell's corners to match a rounded frame drawn behind the board.
   */
  cellMask(factory: () => MaskStrategy): this {
    this._mask = factory;
    return this;
  }

  /**
   * Which way each cell's strip travels while it spins. Cells are 1x1 reel
   * sets, so this picks the edge a coin scrolls in from; the board's own
   * `cols` x `rows` layout is unaffected. Defaults to vertical / forward.
   */
  axis(orientation: Orientation, direction: Direction = 'forward'): this {
    this._orientation = orientation;
    this._direction = direction;
    return this;
  }

  ticker(ticker: Ticker): this {
    this._ticker = ticker;
    return this;
  }

  /** Injected RNG for the spin strips (deterministic demos / tests). */
  rng(fn: () => number): this {
    this._rng = fn;
    return this;
  }

  build(): HoldAndWinBoard<TData> {
    if (!this._configurator) {
      throw new Error('HoldAndWinBuilder: .symbols(...) is required — register at least one coin id.');
    }
    if (!this._ticker) {
      throw new Error('HoldAndWinBuilder: .ticker(...) is required.');
    }
    if (!(this._initialSpeed in this._speeds)) {
      throw new Error(
        `HoldAndWinBuilder: initialSpeed('${this._initialSpeed}') names no registered profile - register it with .speeds({ ... }).`,
      );
    }
    return new HoldAndWinBoard<TData>({
      cols: this._cols,
      rows: this._rows,
      cellWidth: this._cellWidth,
      cellHeight: this._cellHeight,
      columnGap: this._columnGap,
      rowGap: this._rowGap,
      emptyId: this._emptyId,
      inactive: this._inactive,
      inactiveId: this._inactiveId ?? this._emptyId,
      respins: this._respins,
      lockAnimation: this._lockAnimation,
      configurator: this._configurator,
      weights: this._weights,
      symbolData: this._symbolData,
      speeds: this._speeds,
      initialSpeed: this._initialSpeed,
      stagger: this._stagger,
      anticipateWhen: this._anticipateWhen,
      chrome: this._chrome,
      mask: this._mask,
      orientation: this._orientation,
      direction: this._direction,
      ticker: this._ticker,
      rng: this._rng,
    });
  }
}
