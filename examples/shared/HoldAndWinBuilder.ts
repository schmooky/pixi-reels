import { Container, Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { EventEmitter, ReelSetBuilder, SharedRectMaskStrategy, SpeedPresets } from 'pixi-reels';
import type { ReelSet, ReelSymbol, SpeedProfile, SymbolData, SymbolRegistry } from 'pixi-reels';
import { EmptySymbol } from './EmptySymbol.ts';

/**
 * Domain builder for Hold & Win boards.
 *
 * A Hold & Win board is a W×H grid of cells that spin **independently** —
 * the mechanic's atomic unit is the cell, the engine's is the column, so
 * each cell gets its own 1×1 {@link ReelSet}. This builder owns that
 * mapping plus the round choreography every H&W game repeats: spin the
 * free cells, lock the hits, reset-or-decrement the respin counter,
 * detect the full board.
 *
 * It deliberately owns nothing else. Coins are opaque: the board records
 * `{ cell, id, data }` where `id` picks the registered symbol art and
 * `data` is whatever the game layer wants to carry (values, jackpot tiers,
 * collector flags...). Adders, doublers, collectors, flights to trackers —
 * all of that is game design, and games express it through three small
 * openings instead of board features:
 *
 * - **events** — every beat of the round fires with the coin payload
 * - **`symbolAt(cell)`** — the live `ReelSymbol` instance, so a game can
 *   call whatever methods its own symbol class exposes
 * - **`cellBounds()` / `cellCenter()`** — exact pixel geometry for flight
 *   and trail animations that start or end on a cell
 *
 * Collected coins that "fly away" are removed with {@link HoldAndWinBoard.release},
 * which frees the cells for future respins; whether anything ever lands
 * there again stays the server's decision, like every other landing.
 *
 * ```ts
 * const board = new HoldAndWinBuilder<{ value: number }>()
 *   .grid(5, 3)
 *   .cellSize(72, { gap: 4 })
 *   .symbols((r) => r.register('coin', CoinSymbol, COIN_TRIGGER))
 *   .weights({ coin: 1, empty: 3 })
 *   .respins(3)
 *   .ticker(app.ticker)
 *   .build();
 *
 * board.events.on('coin:locked', ({ coin }) => hud.add(coin.data.value));
 * board.enter(triggerCoins);
 * while (true) {
 *   const round = await server.respin(board.lockedCoins);
 *   const result = await board.respin(round.hits);
 *   if (result.done) break;                  // game animates between rounds
 * }
 * ```
 */

/** Grid coordinate of a board cell. */
export interface HwCell {
  col: number;
  row: number;
}

/**
 * A coin somewhere on the board. `id` selects the registered symbol art;
 * `data` is an opaque game-layer payload the board never interprets. The
 * board's ledger stores coins exactly as they landed — if the game mutates
 * a coin's meaning afterwards (boosts, doublers), that live state belongs
 * to the game/server, not the ledger.
 */
export interface HwCoin<TData = unknown> {
  cell: HwCell;
  id: string;
  data?: TData;
}

export type HwRespinReason = 'seed' | 'hit-reset' | 'miss';

/** Resolution of one {@link HoldAndWinBoard.respin} wave. */
export interface HwRespinResult<TData = unknown> {
  round: number;
  hits: HwCoin<TData>[];
  respinsLeft: number;
  full: boolean;
  /** True when the feature is over (counter exhausted or board full). */
  done: boolean;
}

export type HoldAndWinBoardEvents<TData = unknown> = {
  'feature:enter': [{ seed: HwCoin<TData>[]; respins: number }];
  'respin:start': [{ round: number; respinsLeft: number; spinning: HwCell[] }];
  /** Fires per cell, in landing (stagger) order. `coin` is null on a miss. */
  'cell:landed': [{ cell: HwCell; coin: HwCoin<TData> | null }];
  'coin:locked': [{ coin: HwCoin<TData>; locked: number; capacity: number }];
  /** Fired by `release()` — the collect / fly-away moment. */
  'coin:released': [{ coin: HwCoin<TData>; remaining: number }];
  'respins:changed': [{ value: number; reason: HwRespinReason }];
  'respin:end': [{ round: number; hits: HwCoin<TData>[]; respinsLeft: number }];
  'board:full': [{ coins: HwCoin<TData>[] }];
  'feature:end': [{ coins: HwCoin<TData>[]; rounds: number; full: boolean }];
};

export interface HwCellSizeOptions {
  gap?: number;
}

const key = (c: HwCell): string => `${c.col},${c.row}`;

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

  /**
   * Spin strategy. Only `'independent'` (one 1×1 ReelSet per cell) is
   * implemented; the knob exists so a column-synced variant can slot in
   * behind the same API later.
   */
  strategy(strategy: 'independent'): this {
    if (strategy !== 'independent') {
      throw new Error(`HoldAndWinBuilder: only the 'independent' strategy is implemented.`);
    }
    return this;
  }

  cellSize(size: number, opts: HwCellSizeOptions = {}): this {
    this._cell = size;
    this._gap = opts.gap ?? this._gap;
    return this;
  }

  /**
   * Register coin symbol classes, exactly like `ReelSetBuilder.symbols`.
   * Applied to every cell. The board auto-registers an {@link EmptySymbol}
   * under {@link emptyId} unless the configurator registers one itself.
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
   * Per-symbol engine overrides, exactly like `ReelSetBuilder.symbolData`.
   * The headline use here is `{ unmask: true }` for coins whose lock or
   * reveal animations expand past the cell - the engine re-parents them
   * to the viewport's unmasked container so they don't clip. Only safe
   * for server-placed ids (weight 0): unmasked strip symbols mis-track
   * vertically while the reel spins.
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
   * Extra milliseconds of spin per cell, on top of the base profile's
   * minimum spin time. Default `(col + row) * 70` — the diagonal landing
   * wave. Return 0 for simultaneous landings.
   */
  stagger(fn: (col: number, row: number) => number): this {
    this._stagger = fn;
    return this;
  }

  /**
   * When the predicate returns true for a wave, every spinning cell uses a
   * drawn-out tension profile instead of its normal one — the "one cell
   * left for Grand" moment.
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

interface BoardConfig<TData> {
  cols: number;
  rows: number;
  cell: number;
  gap: number;
  emptyId: string;
  respins: number;
  configurator: (registry: SymbolRegistry) => void;
  weights: Record<string, number> | null;
  symbolData: Record<string, Partial<SymbolData>> | null;
  baseProfile: SpeedProfile;
  stagger: (col: number, row: number) => number;
  anticipateWhen:
    | ((state: { locked: number; capacity: number; respinsLeft: number }) => boolean)
    | null;
  chrome: ((g: Graphics, size: number) => void) | null;
  ticker: Ticker;
  rng: (() => number) | null;
}

interface CellRuntime {
  cell: HwCell;
  reelSet: ReelSet;
}

export class HoldAndWinBoard<TData = unknown> {
  public readonly container: Container;
  public readonly events = new EventEmitter<HoldAndWinBoardEvents<TData>>();
  public readonly cols: number;
  public readonly rows: number;

  private readonly _cfg: BoardConfig<TData>;
  private readonly _cells = new Map<string, CellRuntime>();
  private readonly _locked = new Map<string, HwCoin<TData>>();
  private _respinsLeft = 0;
  private _round = 0;
  private _state: 'idle' | 'active' | 'spinning' = 'idle';

  constructor(cfg: BoardConfig<TData>) {
    this._cfg = cfg;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.container = new Container();

    for (let col = 0; col < cfg.cols; col++) {
      for (let row = 0; row < cfg.rows; row++) {
        const origin = this._cellOrigin({ col, row });
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
          // Spine symbols ignore the default per-reel rect mask (the same
          // reason the spine recipes pass this explicitly); without it,
          // buffer-row symbols paint over neighbouring cells.
          .maskStrategy(new SharedRectMaskStrategy())
          .symbols((registry) => {
            cfg.configurator(registry);
            if (!registry.has(cfg.emptyId)) registry.register(cfg.emptyId, EmptySymbol, {});
          })
          .speed('normal', this._profileFor({ col, row }, 0))
          .speed('tension', this._profileFor({ col, row }, 1100))
          .initialFrame([
            { visible: [cfg.emptyId], bufferAbove: [cfg.emptyId], bufferBelow: [cfg.emptyId] },
          ])
          .ticker(cfg.ticker);
        if (cfg.weights) builder.weights(cfg.weights);
        if (cfg.symbolData) builder.symbolData(cfg.symbolData);
        if (cfg.rng) builder.rng(cfg.rng);

        const reelSet = builder.build();
        reelSet.position.set(origin.x, origin.y);
        this.container.addChild(reelSet);
        this._cells.set(key({ col, row }), { cell: { col, row }, reelSet });
      }
    }
  }

  // ── State ────────────────────────────────────────────────────────────

  get capacity(): number {
    return this.cols * this.rows;
  }

  get respinsLeft(): number {
    return this._respinsLeft;
  }

  get lockedCoins(): HwCoin<TData>[] {
    return [...this._locked.values()];
  }

  get isFull(): boolean {
    return this._locked.size === this.capacity;
  }

  get freeCells(): HwCell[] {
    return [...this._cells.values()].filter((c) => !this._locked.has(key(c.cell))).map((c) => c.cell);
  }

  // ── Geometry & instances (the game layer's openings) ────────────────

  /** Board-local bounds of a cell. `container.toGlobal` for stage space. */
  cellBounds(cell: HwCell): { x: number; y: number; width: number; height: number } {
    const origin = this._cellOrigin(cell);
    return { x: origin.x, y: origin.y, width: this._cfg.cell, height: this._cfg.cell };
  }

  /** Board-local center of a cell — flight / trail start and end points. */
  cellCenter(cell: HwCell): { x: number; y: number } {
    const origin = this._cellOrigin(cell);
    return { x: origin.x + this._cfg.cell / 2, y: origin.y + this._cfg.cell / 2 };
  }

  /**
   * Live symbol instance currently shown in a cell. The board never calls
   * anything beyond the `ReelSymbol` contract on it — game layers cast to
   * their own symbol class and use whatever API they gave it.
   */
  symbolAt(cell: HwCell): ReelSymbol {
    return this._runtime(cell).reelSet.getReel(0).getSymbolAt(0);
  }

  // ── Round choreography ───────────────────────────────────────────────

  /**
   * Activate the feature with the coins that triggered it. Seeds land
   * locked and instantly (no spin) and the respin counter fills.
   */
  enter(seed: HwCoin<TData>[]): void {
    if (this._state !== 'idle') {
      throw new Error('HoldAndWinBoard: enter() while a feature is active — call reset() first.');
    }
    for (const coin of seed) {
      this._place(coin.cell, coin.id);
      this._locked.set(key(coin.cell), coin);
    }
    this._round = 0;
    this._state = 'active';
    this._setRespins(this._cfg.respins, 'seed');
    this.events.emit('feature:enter', { seed: [...seed], respins: this._respinsLeft });
  }

  /**
   * Spin every free cell; `hits` land (and lock) their coins, all other
   * spinning cells land empty. Resolves once the whole wave has landed and
   * the counter has been resolved. The game layer drives pacing — anything
   * can happen between two `respin()` calls.
   */
  async respin(hits: HwCoin<TData>[]): Promise<HwRespinResult<TData>> {
    if (this._state === 'idle') {
      throw new Error('HoldAndWinBoard: respin() before enter().');
    }
    if (this._state === 'spinning') {
      throw new Error('HoldAndWinBoard: respin() while a wave is in flight.');
    }
    const hitByKey = new Map<string, HwCoin<TData>>();
    for (const hit of hits) {
      const k = key(hit.cell);
      if (this._locked.has(k)) {
        throw new Error(`HoldAndWinBoard: hit targets locked cell ${k}.`);
      }
      hitByKey.set(k, hit);
    }

    const spinning = this.freeCells;
    this._state = 'spinning';
    this._round += 1;
    const round = this._round;
    this.events.emit('respin:start', { round, respinsLeft: this._respinsLeft, spinning });

    const tense =
      this._anticipating() && spinning.length > 0;
    const landed: HwCoin<TData>[] = [];
    const waves = spinning.map(async (cell) => {
      const runtime = this._runtime(cell);
      runtime.reelSet.speed.set(tense ? 'tension' : 'normal');
      const coin = hitByKey.get(key(cell)) ?? null;
      const settle = runtime.reelSet.spin();
      // Buffers land empty too: anything parked off-window at rest can
      // paint over neighbouring cells (spine content outruns the masks).
      runtime.reelSet.setResult([
        {
          visible: [coin ? coin.id : this._cfg.emptyId],
          bufferAbove: [this._cfg.emptyId],
          bufferBelow: [this._cfg.emptyId],
        },
      ]);
      await settle;
      this.events.emit('cell:landed', { cell, coin });
      if (coin) {
        landed.push(coin);
        this._locked.set(key(cell), coin);
        void this.symbolAt(cell).playWin().catch(() => undefined);
        this.events.emit('coin:locked', {
          coin,
          locked: this._locked.size,
          capacity: this.capacity,
        });
      }
    });
    await Promise.all(waves);

    if (landed.length > 0) this._setRespins(this._cfg.respins, 'hit-reset');
    else this._setRespins(this._respinsLeft - 1, 'miss');
    this._state = 'active';
    this.events.emit('respin:end', { round, hits: landed, respinsLeft: this._respinsLeft });

    const full = this.isFull;
    if (full) this.events.emit('board:full', { coins: this.lockedCoins });
    const done = full || this._respinsLeft <= 0;
    if (done) {
      this._state = 'idle';
      this.events.emit('feature:end', { coins: this.lockedCoins, rounds: round, full });
    }
    return { round, hits: landed, respinsLeft: this._respinsLeft, full, done };
  }

  /**
   * Remove locked coins — the collect moment, when coins fly off into a
   * collector or tracker. The board clears the cells (they become free
   * for future respins) and returns the released coins; the flight itself
   * is game-layer animation, started from `cellCenter()` before calling
   * this, or from the `coin:released` event.
   */
  release(cells: HwCell[]): HwCoin<TData>[] {
    const released: HwCoin<TData>[] = [];
    for (const cell of cells) {
      const k = key(cell);
      const coin = this._locked.get(k);
      if (!coin) continue;
      this._locked.delete(k);
      this._place(cell, this._cfg.emptyId);
      released.push(coin);
      this.events.emit('coin:released', { coin, remaining: this._locked.size });
    }
    return released;
  }

  /** Clear the board back to idle: no locks, blank cells, counter unset. */
  reset(): void {
    this._locked.clear();
    this._round = 0;
    this._respinsLeft = 0;
    this._state = 'idle';
    for (const { cell } of this._cells.values()) this._place(cell, this._cfg.emptyId);
  }

  destroy(): void {
    for (const { reelSet } of this._cells.values()) reelSet.destroy();
    this._cells.clear();
    this._locked.clear();
    this.container.destroy({ children: true });
  }

  // ── Internals ────────────────────────────────────────────────────────

  private _cellOrigin(cell: HwCell): { x: number; y: number } {
    return {
      x: cell.col * (this._cfg.cell + this._cfg.gap),
      y: cell.row * (this._cfg.cell + this._cfg.gap),
    };
  }

  private _runtime(cell: HwCell): CellRuntime {
    const runtime = this._cells.get(key(cell));
    if (!runtime) {
      throw new Error(`HoldAndWinBoard: cell ${key(cell)} is outside the ${this.cols}x${this.rows} grid.`);
    }
    return runtime;
  }

  private _place(cell: HwCell, id: string): void {
    // Negative-index properties address bufferAbove slots; index 1 is the
    // single bufferBelow slot. Explicit empties keep the rest state clean
    // (unset slots would be random-filled and can leak past the mask).
    const ids: string[] & Record<number, string> = [id];
    ids[-1] = this._cfg.emptyId;
    ids[1] = this._cfg.emptyId;
    this._runtime(cell).reelSet.getReel(0).placeSymbols(ids);
  }

  private _profileFor(cell: HwCell, extraMs: number): SpeedProfile {
    const base = this._cfg.baseProfile;
    return {
      ...base,
      minimumSpinTime: (base.minimumSpinTime ?? 320) + this._cfg.stagger(cell.col, cell.row) + extraMs,
    };
  }

  private _anticipating(): boolean {
    if (!this._cfg.anticipateWhen) return false;
    return this._cfg.anticipateWhen({
      locked: this._locked.size,
      capacity: this.capacity,
      respinsLeft: this._respinsLeft,
    });
  }

  private _setRespins(value: number, reason: HwRespinReason): void {
    this._respinsLeft = Math.max(0, value);
    this.events.emit('respins:changed', { value: this._respinsLeft, reason });
  }
}
