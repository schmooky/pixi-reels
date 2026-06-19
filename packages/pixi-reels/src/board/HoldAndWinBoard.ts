import type { Container, Graphics, Ticker } from 'pixi.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
import type { Disposable } from '../utils/Disposable.js';
import { BoardGrid } from './BoardGrid.js';
import { HoldAndWinState } from './HoldAndWinState.js';
import type { HwPhase } from './HoldAndWinState.js';
import { cellKey } from './HwTypes.js';
import type {
  HoldAndWinBoardEvents,
  HwCell,
  HwCoin,
  HwEffect,
  HwRespinResult,
} from './HwTypes.js';

/** Internal config produced by {@link HoldAndWinBuilder.build}. */
export interface HoldAndWinBoardConfig<TData> {
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

/** Extra spin time (ms) a tense wave adds on top of the normal profile. */
const TENSION_EXTRA_MS = 1100;

/**
 * A Hold & Win board: a grid of independently spinning cells plus the round
 * choreography every H&W game repeats — spin the free cells, lock the hits,
 * reset-or-decrement the respin counter, detect the full board.
 *
 * It composes two collaborators: a `BoardGrid` (the generic "board of reels"
 * mechanism — geometry, instances, spinning) and a `HoldAndWinState` (the pure
 * single-source reducer — ledger, counter, phase). The board is the
 * mediator: it drives the reels, reports each landing to the reducer, and
 * replays the reducer's decided effects onto {@link events}.
 *
 * It deliberately owns nothing about *value*. Coins are opaque `{ cell, id, data }`
 * — `id` picks the registered art, `data` is the game layer's to read and mutate.
 * Adders, doublers, collectors and flights are game design, expressed through
 * three openings rather than board features: {@link events}, {@link symbolAt}
 * (the live `ReelSymbol` instance) and {@link cellBounds}/{@link cellCenter}
 * (pixel geometry for flights).
 *
 * ```ts
 * const board = new HoldAndWinBuilder<{ value: number }>()
 *   .grid(5, 3).cellSize(72, { gap: 4 })
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
  private readonly _anticipateWhen: HoldAndWinBoardConfig<TData>['anticipateWhen'];

  constructor(cfg: HoldAndWinBoardConfig<TData>) {
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this._emptyId = cfg.emptyId;
    this._anticipateWhen = cfg.anticipateWhen;

    const base = (cell: HwCell): number =>
      (cfg.baseProfile.minimumSpinTime ?? 320) + cfg.stagger(cell.col, cell.row);
    this._grid = new BoardGrid({
      cols: cfg.cols,
      rows: cfg.rows,
      cellSize: cfg.cell,
      gap: cfg.gap,
      emptyId: cfg.emptyId,
      symbols: cfg.configurator,
      weights: cfg.weights ?? undefined,
      symbolData: cfg.symbolData ?? undefined,
      chrome: cfg.chrome ?? undefined,
      ticker: cfg.ticker,
      rng: cfg.rng ?? undefined,
      profiles: {
        normal: (cell) => ({ ...cfg.baseProfile, minimumSpinTime: base(cell) }),
        tension: (cell) => ({ ...cfg.baseProfile, minimumSpinTime: base(cell) + TENSION_EXTRA_MS }),
      },
    });
    this._state = new HoldAndWinState<TData>(this._grid.cells(), cfg.respins);
  }

  // ── State (delegated to the single-source reducer) ───────────────────

  get container(): Container {
    return this._grid.container;
  }
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
  get freeCells(): HwCell[] {
    return this._state.freeCells();
  }
  /** Where the feature is right now: idle (no feature), active, or spinning. */
  get phase(): HwPhase {
    return this._state.phase;
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
   * Rewrite a **locked** cell's coin in place — coin → jackpot, mini → major,
   * raise a tier — without disturbing any other cell. The ledger entry is
   * rewritten so `lockedCoins` and totals stay correct. Throws on a free cell.
   * Returns the new live symbol instance.
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

    const tense = this._anticipating() && spinning.length > 0;
    for (const cell of spinning) this._grid.setProfile(cell, tense ? 'tension' : 'normal');
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
  }

  /**
   * Remove locked coins — the collect moment. Clears the cells (they become
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

  /** Clear the board back to idle. Fires `feature:reset` (not `coin:released`). */
  reset(): void {
    const effects = this._state.reset();
    for (const cell of this._grid.cells()) this._grid.place(cell, this._emptyId);
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
      if (fx.type === 'coin:locked') {
        // playWin is presentation; a hiccup must not break the feature flow.
        void this.symbolAt(fx.payload.coin.cell)
          .playWin()
          .catch(() => undefined);
      }
    }
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
