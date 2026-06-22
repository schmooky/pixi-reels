import type { Graphics, Ticker } from 'pixi.js';
import { SpeedPresets } from '../config/SpeedPresets.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { HoldAndWinBoard } from './HoldAndWinBoard.js';
import type { HwCellSizeOptions } from './HwTypes.js';

/**
 * Fluent builder for {@link HoldAndWinBoard}.
 *
 * A Hold & Win board is a W×H grid of cells that spin **independently** — the
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
  private _cell = 72;
  private _gap = 4;
  private _emptyId = 'empty';
  private _respins = 3;
  private _configurator: ((registry: SymbolRegistry) => void) | null = null;
  private _weights: Record<string, number> | null = null;
  private _symbolData: Record<string, Partial<SymbolData>> | null = null;
  private _baseProfile: SpeedProfile = { ...SpeedPresets.NORMAL, minimumSpinTime: 320 };
  private _stagger: (col: number, row: number) => number = (col, row) => (col + row) * 70;
  private _anticipateWhen:
    | ((state: { locked: number; capacity: number; respinsLeft: number }) => boolean)
    | null = null;
  private _chrome: ((g: Graphics, size: number) => void) | null = null;
  private _ticker: Ticker | null = null;
  private _rng: (() => number) | null = null;

  grid(cols: number, rows: number): this {
    this._cols = cols;
    this._rows = rows;
    return this;
  }

  cellSize(size: number, opts: HwCellSizeOptions = {}): this {
    this._cell = size;
    this._gap = opts.gap ?? this._gap;
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
   * Per-symbol engine overrides, exactly like `ReelSetBuilder.symbolData`. The
   * headline use is `{ unmask: true }` for coins whose lock/reveal animations
   * expand past the cell. Safe only for server-placed ids (weight 0): unmasked
   * strip symbols mis-track vertically while the reel spins.
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

  /** Base spin feel for every cell. Default: NORMAL with a 320ms floor. */
  speedProfile(profile: SpeedProfile): this {
    this._baseProfile = profile;
    return this;
  }

  /**
   * Extra milliseconds of spin per cell on top of the base minimum spin time.
   * Default `(col + row) * 70` — the diagonal landing wave. Return 0 for
   * simultaneous landings.
   */
  stagger(fn: (col: number, row: number) => number): this {
    this._stagger = fn;
    return this;
  }

  /**
   * When the predicate returns true for a wave, **every** spinning cell uses a
   * drawn-out tension profile — the "one cell left for Grand" moment. Evaluated
   * once per wave for the whole board (not per cell), against the pre-wave state.
   */
  anticipateWhen(
    fn: (state: { locked: number; capacity: number; respinsLeft: number }) => boolean,
  ): this {
    this._anticipateWhen = fn;
    return this;
  }

  /** Per-cell background, drawn behind each mini reel. */
  cellChrome(draw: (g: Graphics, size: number) => void): this {
    this._chrome = draw;
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
    return new HoldAndWinBoard<TData>({
      cols: this._cols,
      rows: this._rows,
      cell: this._cell,
      gap: this._gap,
      emptyId: this._emptyId,
      respins: this._respins,
      configurator: this._configurator,
      weights: this._weights,
      symbolData: this._symbolData,
      baseProfile: this._baseProfile,
      stagger: this._stagger,
      anticipateWhen: this._anticipateWhen,
      chrome: this._chrome,
      ticker: this._ticker,
      rng: this._rng,
    });
  }
}
