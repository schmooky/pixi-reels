import type { Container, Graphics, Ticker } from 'pixi.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
import type { Disposable } from '../utils/Disposable.js';
import { BoardGrid } from './BoardGrid.js';
import type { BoardCellMaskInfo, BoardProfile } from './BoardGrid.js';
import type { Direction, Orientation } from '../core/ReelAxis.js';
import type { MaskStrategy } from '../core/ReelViewport.js';
import { HoldAndWinState } from './HoldAndWinState.js';
import type { HwPhase } from './HoldAndWinState.js';
import { cellKey } from './HwTypes.js';
import { noticeWarn } from '../utils/notify.js';
import type {
  HoldAndWinBoardEvents,
  HwCell,
  HwCoin,
  HwEffect,
  HwLockAnimation,
  HwRespinResult,
} from './HwTypes.js';

/** Internal config produced by {@link HoldAndWinBuilder.build}. */
export interface HoldAndWinBoardConfig<TData> {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  columnGap: number;
  rowGap: number;
  emptyId: string;
  /** Cells built dormant; see `HoldAndWinBuilder.inactive`. */
  inactive: HwCell[];
  /** Symbol shown on a dormant cell. */
  inactiveId: string;
  respins: number;
  lockAnimation: HwLockAnimation;
  configurator: (registry: SymbolRegistry) => void;
  weights: Record<string, number> | null;
  symbolData: Record<string, Partial<SymbolData>> | null;
  /** Named base profiles, registered into every cell. See `HoldAndWinBuilder.speeds`. */
  speeds: Record<string, SpeedProfile>;
  initialSpeed: string;
  stagger: (reel: number, cell: number, speed: string) => number;
  anticipateWhen:
    | ((state: { locked: number; capacity: number; respinsLeft: number }) => boolean)
    | null;
  chrome: ((g: Graphics, width: number, height: number) => void) | null;
  /** Per-cell mask factory. See `HoldAndWinBuilder.cellMask`. */
  mask: ((cell: HwCell, info: BoardCellMaskInfo) => MaskStrategy) | null;
  /** Travel axis for each cell's own strip. See `HoldAndWinBuilder.axis`. */
  orientation?: Orientation;
  direction?: Direction;
  ticker: Ticker;
  rng: (() => number) | null;
}

/** Extra spin time (ms) a tense wave adds on top of the normal profile. */
const TENSION_EXTRA_MS = 1100;

/**
 * A Hold & Win board: a grid of independently spinning cells plus the round
 * choreography every H&W game repeats - spin the free cells, lock the hits,
 * reset-or-decrement the respin counter, detect the full board.
 *
 * It composes two collaborators: a `BoardGrid` (the generic "board of reels"
 * mechanism - geometry, instances, spinning) and a `HoldAndWinState` (the pure
 * single-source reducer - ledger, counter, phase). The board is the
 * mediator: it drives the reels, reports each landing to the reducer, and
 * replays the reducer's decided effects onto {@link events}.
 *
 * It deliberately owns nothing about *value*. Coins are opaque `{ cell, id, data }`
 * - `id` picks the registered art, `data` is the game layer's to read and mutate.
 * Adders, doublers, collectors and flights are game design, expressed through
 * three openings rather than board features: {@link events}, {@link symbolAt}
 * (the live `ReelSymbol` instance) and {@link cellBounds}/{@link cellCenter}
 * (pixel geometry for flights).
 *
 * ```ts
 * const board = new HoldAndWinBuilder<{ value: number }>()
 *   .grid(5, 3).cellSize({ width: 101, height: 85 }, { columnGap: 4, rowGap: 0 })
 *   .symbols((r) => r.register('coin', CoinSymbol, COIN_TRIGGER))
 *   .weights({ coin: 1, empty: 3 }).respins(3).ticker(app.ticker)
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
export class HoldAndWinBoard<TData = unknown> implements Disposable {
  readonly events = new EventEmitter<HoldAndWinBoardEvents<TData>>();
  readonly cols: number;
  readonly rows: number;

  private readonly _grid: BoardGrid;
  private readonly _state: HoldAndWinState<TData>;
  private readonly _emptyId: string;
  private readonly _inactiveId: string;
  private readonly _lockAnimation: HwLockAnimation;
  private readonly _anticipateWhen: HoldAndWinBoardConfig<TData>['anticipateWhen'];
  private readonly _stagger: HoldAndWinBoardConfig<TData>['stagger'];
  private readonly _speeds = new Set<string>();
  private _speed: string;
  /** Whether the wave in flight (if any) runs on the tension variants. */
  private _tenseWave = false;

  constructor(cfg: HoldAndWinBoardConfig<TData>) {
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this._emptyId = cfg.emptyId;
    this._inactiveId = cfg.inactiveId;
    this._lockAnimation = cfg.lockAnimation;
    this._anticipateWhen = cfg.anticipateWhen;
    this._stagger = cfg.stagger;
    this._speed = cfg.initialSpeed;

    // Every named speed becomes two per-cell profiles: `name` and
    // `name:tension`, the latter the drawn-out variant of an anticipating
    // wave. The initial speed goes first: BoardGrid activates the first name.
    const names = [cfg.initialSpeed, ...Object.keys(cfg.speeds).filter((n) => n !== cfg.initialSpeed)];
    const profiles: Record<string, BoardProfile> = {};
    for (const name of names) {
      const profile = cfg.speeds[name];
      this._speeds.add(name);
      profiles[name] = (cell) => this._profileFor(name, profile, cell, false);
      profiles[`${name}:tension`] = (cell) => this._profileFor(name, profile, cell, true);
    }
    this._grid = new BoardGrid({
      cols: cfg.cols,
      rows: cfg.rows,
      cellSize: { width: cfg.cellWidth, height: cfg.cellHeight },
      columnGap: cfg.columnGap,
      rowGap: cfg.rowGap,
      emptyId: cfg.emptyId,
      symbols: (registry) => {
        cfg.configurator(registry);
        // The empty id is auto-registered downstream; a distinct dormant id is
        // the game's to provide, and a typo here would only surface as a
        // logged slam on the first place(). Fail at build instead.
        if (cfg.inactiveId !== cfg.emptyId && !registry.has(cfg.inactiveId)) {
          throw new Error(
            `HoldAndWinBuilder: inactive(cells, '${cfg.inactiveId}') names a symbol id that .symbols(...) never registered.`,
          );
        }
      },
      weights: cfg.weights ?? undefined,
      symbolData: cfg.symbolData ?? undefined,
      chrome: cfg.chrome ?? undefined,
      mask: cfg.mask ?? undefined,
      orientation: cfg.orientation,
      direction: cfg.direction,
      ticker: cfg.ticker,
      rng: cfg.rng ?? undefined,
      profiles,
    });
    this._state = new HoldAndWinState<TData>(this._grid.cells(), cfg.respins, cfg.inactive);
    this._dressInactive();
  }

  // ── State (delegated to the single-source reducer) ───────────────────

  get container(): Container {
    return this._grid.container;
  }
  /** Number of active cells - what `isFull` is measured against. */
  get capacity(): number {
    return this._state.capacity;
  }
  get respinsLeft(): number {
    return this._state.respinsLeft;
  }
  get lockedCoins(): HwCoin<TData>[] {
    return this._state.lockedCoins();
  }
  get isFull(): boolean {
    return this._state.isFull;
  }
  /** Active cells holding no coin. */
  get freeCells(): HwCell[] {
    return this._state.freeCells();
  }
  /** Dormant cells - built, drawn, but not part of the feature yet. */
  get inactiveCells(): HwCell[] {
    return this._state.inactiveCells();
  }
  /** Where the feature is right now: idle (no feature), active, or spinning. */
  get phase(): HwPhase {
    return this._state.phase;
  }
  /** Name of the speed profile every cell is set to. */
  get speed(): string {
    return this._speed;
  }
  /** Every registered speed name, initial first. */
  get speedNames(): string[] {
    return [...this._speeds];
  }

  // ── Geometry & instances (the game layer's openings) ────────────────

  cellBounds(cell: HwCell): { x: number; y: number; width: number; height: number } {
    return this._grid.cellBounds(cell);
  }
  cellCenter(cell: HwCell): { x: number; y: number } {
    return this._grid.cellCenter(cell);
  }
  /** Live symbol instance currently shown in a cell. */
  symbolAt(cell: HwCell): ReelSymbol {
    return this._grid.symbolAt(cell);
  }
  /** The cell's underlying 1×1 ReelSet, for driving one cell directly. */
  reelAt(cell: HwCell): ReelSet {
    return this._grid.reelAt(cell);
  }

  /**
   * Rewrite a **locked** cell's coin in place - coin → jackpot, mini → major,
   * raise a tier - without disturbing any other cell. The ledger entry is
   * rewritten so `lockedCoins` and totals stay correct. Throws on a free cell.
   * Returns the new live symbol instance.
   *
   * Throws if called while a wave is in flight - `await respin()` first. To
   * upgrade a coin in reaction to its own `coin:locked`, defer the swap until
   * the awaited `respin()` resolves rather than swapping inside the listener.
   */
  setSymbolAt(cell: HwCell, id: string, data?: TData): ReelSymbol {
    this._state.swap(cell, id, data);
    this._grid.place(cell, id);
    return this._grid.symbolAt(cell);
  }

  // ── Round choreography ───────────────────────────────────────────────

  /** Activate the feature with the trigger coins. Seeds land locked, instantly. */
  enter(seed: HwCoin<TData>[]): void {
    const effects = this._state.enter(seed); // validates first; throws before any visual
    for (const coin of seed) this._grid.place(coin.cell, coin.id);
    this._apply(effects);
  }

  /**
   * Spin every free cell; `hits` land (and lock) their coins, all other spinning
   * cells land empty. Resolves once the wave has landed and the counter is
   * resolved. The game layer drives pacing between rounds.
   */
  async respin(hits: HwCoin<TData>[]): Promise<HwRespinResult<TData>> {
    const { round, spinning, hitByKey } = this._state.beginWave(hits);
    try {
      const tense = this._anticipating() && spinning.length > 0;
      this._tenseWave = tense;
      const variant = tense ? `${this._speed}:tension` : this._speed;
      for (const cell of spinning) this._grid.setProfile(cell, variant);
      this.events.emit('respin:start', { round, respinsLeft: this._state.respinsLeft, spinning });

      const targets = spinning.map((cell) => ({
        cell,
        id: hitByKey.get(cellKey(cell))?.id ?? this._emptyId,
      }));
      await this._grid.spinCells(targets, (cell) => {
        this._apply(this._state.land(cell, hitByKey.get(cellKey(cell)) ?? null));
      });

      const { effects, landed } = this._state.endWave();
      this._apply(effects);
      return {
        round,
        hits: landed,
        respinsLeft: this._state.respinsLeft,
        full: this._state.isFull,
        done: this._state.phase === 'idle',
      };
    } catch (err) {
      // A synchronous throw between beginWave and endWave - most plausibly a
      // game-layer event listener (respin:start / cell:landed / coin:locked)
      // throwing - must not strand the board. (An unregistered symbol id does
      // NOT land here: the engine logs and slams the reel internally, so the
      // spin resolves rather than rejecting.) abortWave() restores the reducer
      // phase, else every later respin() throws "wave in flight"; skipSpinning()
      // lands any cell still in flight, else the next respin() throws "already
      // spinning" on it. Stray landings from those slams are dropped by the
      // reducer's not-spinning guard. Rethrow so the caller still sees it.
      this._state.abortWave();
      this._grid.skipSpinning();
      throw err;
    }
  }

  /**
   * Switch every cell to a registered speed profile at once - the board's
   * `reelSet.setSpeed()`. Takes hold immediately on every cell's SpeedManager;
   * as on a reel set, a cell already in flight finishes on the profile it
   * started with, so a wave in progress shows the change from its next wave -
   * or right away after `skip()`, the turbo-button semantic. Fires
   * `speed:changed`.
   */
  setSpeed(name: string): void {
    if (!this._speeds.has(name)) {
      throw new Error(
        `HoldAndWinBoard: setSpeed('${name}') names no registered profile (have: ${[...this._speeds].join(', ')}).`,
      );
    }
    const previous = this._speed;
    this._speed = name;
    const variant = this._state.phase === 'spinning' && this._tenseWave ? `${name}:tension` : name;
    for (const cell of this._grid.cells()) this._grid.setProfile(cell, variant);
    this.events.emit('speed:changed', { name, previous });
  }

  /**
   * Register one more named profile into every cell's SpeedManager after
   * build - `reelSet.speed.addProfile()` for the whole board. Its tension
   * variant is derived the same way as for the built-in ones. Select it with
   * {@link setSpeed}.
   */
  addSpeed(name: string, profile: SpeedProfile): void {
    for (const cell of this._grid.cells()) {
      const manager = this._grid.reelAt(cell).speed;
      manager.addProfile(name, this._profileFor(name, profile, cell, false));
      manager.addProfile(`${name}:tension`, this._profileFor(name, profile, cell, true));
    }
    this._speeds.add(name);
  }

  /**
   * Play the win animation on locked coins - by default every one of them, or
   * just `cells`. Resolves when the last one finishes. This is the explicit
   * celebration for a board built with `lockAnimation('landing' | 'none')`,
   * typically fired on `board:full` or `feature:end`; on the default `'win'`
   * board it simply replays what each lock already played.
   */
  async playWin(cells?: HwCell[]): Promise<void> {
    const targets = cells ?? this._state.lockedCoins().map((coin) => coin.cell);
    await Promise.all(targets.map((cell) => this._playOn(cell, 'win')));
  }

  /**
   * Wake dormant cells (see `HoldAndWinBuilder.inactive`): they show the empty
   * symbol, join the next respin and count toward the full board from now on.
   * Fires `cells:activated`. Not allowed while a wave is in flight.
   */
  activate(cells: HwCell[]): void {
    const effects = this._state.activate(cells); // validates first; throws before any visual
    for (const cell of cells) this._grid.place(cell, this._emptyId);
    this._apply(effects);
  }

  /**
   * Remove locked coins - the collect moment. Clears the cells (they become
   * free again) and returns the released coins; the flight itself is game-layer
   * animation, started from `cellCenter()` or the `coin:released` event.
   */
  release(cells: HwCell[]): HwCoin<TData>[] {
    const { effects, released } = this._state.release(cells);
    for (const coin of released) this._grid.place(coin.cell, this._emptyId);
    this._apply(effects);
    return released;
  }

  /**
   * Fast-forward whatever is spinning: every in-flight cell is slammed to its
   * landed position, then `feature:skip` fires so the game layer can cut its own
   * flights short. The normal landing → `coin:locked` → `feature:end` flow still
   * resolves; this only removes the waiting. Returns the number of cells that
   * were in flight.
   */
  skip(): number {
    const inFlight = this._grid.skipSpinning();
    this.events.emit('feature:skip', { inFlight });
    return inFlight;
  }

  /**
   * Clear the board back to idle. Fires `feature:reset` (not `coin:released`).
   * Cells activated during the feature go dormant again.
   */
  reset(): void {
    const effects = this._state.reset();
    for (const cell of this._grid.cells()) this._grid.place(cell, this._emptyId);
    this._dressInactive();
    this._apply(effects);
  }

  get isDestroyed(): boolean {
    return this._grid.isDestroyed;
  }

  destroy(): void {
    if (this._grid.isDestroyed) return;
    this.events.removeAllListeners();
    this._grid.destroy();
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Emit each reducer-decided effect and fire the visual side effects. */
  private _apply(effects: HwEffect<TData>[]): void {
    for (const fx of effects) {
      // Correlated union: `fx.type` and `fx.payload` are paired by construction
      // in the reducer, but TS can't carry that correlation through `emit`'s
      // generic. One local cast keeps every other call site fully typed.
      (this.events.emit as (type: string, payload: unknown) => void)(fx.type, fx.payload);
      if (fx.type === 'coin:locked' && this._lockAnimation !== 'none') {
        void this._playOn(fx.payload.coin.cell, this._lockAnimation);
      }
    }
  }

  /**
   * Play one of a symbol's one-shots. Presentation: a hiccup must not break
   * the feature flow, but it must not vanish silently either - log it like the
   * rest of the engine.
   */
  private _playOn(cell: HwCell, anim: 'win' | 'landing'): Promise<void> {
    const symbol = this.symbolAt(cell);
    const run = anim === 'win' ? symbol.playWin() : symbol.playLanding();
    return run.catch((err) =>
      noticeWarn(`hw-coin-${anim}-failed`, `HoldAndWinBoard: coin ${anim} animation failed.`, err),
    );
  }

  /** A cell's concrete profile for a named speed: the base plus this cell's stagger. */
  private _profileFor(name: string, profile: SpeedProfile, cell: HwCell, tense: boolean): SpeedProfile {
    const floor = (profile.minimumSpinTime ?? 320) + this._stagger(cell.reel, cell.cell, name);
    return { ...profile, minimumSpinTime: floor + (tense ? TENSION_EXTRA_MS : 0) };
  }

  /** Show the dormant symbol on every currently inactive cell. */
  private _dressInactive(): void {
    for (const cell of this._state.inactiveCells()) this._grid.place(cell, this._inactiveId);
  }

  private _anticipating(): boolean {
    if (!this._anticipateWhen) return false;
    return this._anticipateWhen({
      locked: this._state.lockedCoins().length,
      capacity: this._state.capacity,
      respinsLeft: this._state.respinsLeft,
    });
  }
}
