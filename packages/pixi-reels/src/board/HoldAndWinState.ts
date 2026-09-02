import type { HwCell, HwCoin, HwEffect, HwRespinReason } from './HwTypes.js';
import { cellKey } from './HwTypes.js';

export type HwPhase = 'idle' | 'active' | 'spinning';

/**
 * The pure Hold & Win state machine - the single source of truth for board
 * state, with **zero** PixiJS. It owns the locked-coin ledger, the respin
 * counter, the round number, the set of dormant cells and the feature
 * {@link HwPhase}; every derived value (`freeCells`, `isFull`, `capacity`) is
 * computed from that state, never stored in parallel, so nothing can drift
 * out of sync.
 *
 * It is a *reducer, not a cache*: {@link HoldAndWinBoard} drives the reels and
 * reports each landing here; the methods mutate the ledger and **return the
 * ordered list of {@link HwEffect}s to emit**, which the driver replays onto its
 * event emitter (and uses to fire visual side effects like `playWin()`). Locks
 * happen progressively as cells land in stagger order, so this is an
 * *incremental* reducer ({@link beginWave} → N×{@link land} → {@link endWave}),
 * not a one-shot `reduce(state, hits)`.
 *
 * Being PixiJS-free, it is fully unit-testable: assert the returned effect
 * sequence for hit / miss / full / release / reset / error paths.
 */
export class HoldAndWinState<TData = unknown> {
  private readonly _locked = new Map<string, HwCoin<TData>>();
  private readonly _cellSet: Set<string>;
  private readonly _allCells: HwCell[];
  private readonly _initialInactive: Set<string>;
  private readonly _inactive: Set<string>;
  private readonly _defaultRespins: number;
  private _respinsLeft = 0;
  private _round = 0;
  private _phase: HwPhase = 'idle';
  private _waveLanded: HwCoin<TData>[] = [];

  /**
   * `inactive` cells exist in the grid but take no part in the feature until
   * {@link activate}d: they never spin, never take a coin, and do not count
   * toward `capacity`. `reset()` puts them back to dormant.
   */
  constructor(allCells: HwCell[], defaultRespins: number, inactive: HwCell[] = []) {
    this._allCells = allCells;
    this._cellSet = new Set(allCells.map(cellKey));
    this._defaultRespins = defaultRespins;
    for (const cell of inactive) {
      if (!this._cellSet.has(cellKey(cell))) {
        throw new Error(`HoldAndWinBoard: inactive cell ${cellKey(cell)} is outside the grid.`);
      }
    }
    this._initialInactive = new Set(inactive.map(cellKey));
    this._inactive = new Set(this._initialInactive);
  }

  // ── Queries ──────────────────────────────────────────────────────────

  get phase(): HwPhase {
    return this._phase;
  }
  get respinsLeft(): number {
    return this._respinsLeft;
  }
  get round(): number {
    return this._round;
  }
  /** Number of active cells - what `isFull` is measured against. */
  get capacity(): number {
    return this._allCells.length - this._inactive.size;
  }
  get isFull(): boolean {
    return this._locked.size === this.capacity;
  }

  lockedCoins(): HwCoin<TData>[] {
    return [...this._locked.values()];
  }

  /** Active cells with no coin. */
  freeCells(): HwCell[] {
    return this._allCells.filter((c) => {
      const k = cellKey(c);
      return !this._locked.has(k) && !this._inactive.has(k);
    });
  }

  /** Cells that are dormant right now. */
  inactiveCells(): HwCell[] {
    return this._allCells.filter((c) => this._inactive.has(cellKey(c)));
  }

  isActive(cell: HwCell): boolean {
    return !this._inactive.has(cellKey(cell));
  }

  isLocked(cell: HwCell): boolean {
    return this._locked.has(cellKey(cell));
  }

  coinAt(cell: HwCell): HwCoin<TData> | undefined {
    return this._locked.get(cellKey(cell));
  }

  // ── Transitions (mutate + return effects to emit) ───────────────────

  /** Seed the trigger coins and arm the counter. Idle → active. */
  enter(seed: HwCoin<TData>[]): HwEffect<TData>[] {
    if (this._phase !== 'idle') {
      throw new Error('HoldAndWinBoard: enter() while a feature is active — call reset() first.');
    }
    const placed: HwCoin<TData>[] = [];
    const seen = new Set<string>();
    for (const coin of seed) {
      const k = cellKey(coin.cell);
      this._assertActive(coin.cell, 'enter');
      if (seen.has(k)) throw new Error(`HoldAndWinBoard: enter() seeds cell ${k} twice.`);
      seen.add(k);
      const stored = this._freeze(coin.cell, coin.id, coin.data);
      this._locked.set(k, stored);
      placed.push(stored);
    }
    this._round = 0;
    this._phase = 'active';
    return [
      this._setRespins(this._defaultRespins, 'seed'),
      { type: 'feature:enter', payload: { seed: placed, respins: this._respinsLeft } },
    ];
  }

  /**
   * Open a wave: validate the hits, mark every free cell as spinning, bump the
   * round. Returns the data the driver needs to emit `respin:start` and to land
   * each cell. Active → spinning.
   */
  beginWave(hits: HwCoin<TData>[]): {
    round: number;
    spinning: HwCell[];
    hitByKey: Map<string, HwCoin<TData>>;
  } {
    if (this._phase === 'idle') {
      throw new Error('HoldAndWinBoard: respin() before enter().');
    }
    if (this._phase === 'spinning') {
      throw new Error('HoldAndWinBoard: respin() while a wave is in flight.');
    }
    const hitByKey = new Map<string, HwCoin<TData>>();
    for (const hit of hits) {
      const k = cellKey(hit.cell);
      this._assertActive(hit.cell, 'respin');
      if (this._locked.has(k)) throw new Error(`HoldAndWinBoard: hit targets locked cell ${k}.`);
      // A free cell can only land once per wave, so a duplicate hit is always a
      // malformed result. Fail loud rather than silently dropping the first coin.
      if (hitByKey.has(k)) throw new Error(`HoldAndWinBoard: respin() targets cell ${k} twice.`);
      hitByKey.set(k, hit);
    }
    this._waveLanded = [];
    this._phase = 'spinning';
    this._round += 1;
    return { round: this._round, spinning: this.freeCells(), hitByKey };
  }

  /** Record one cell's landing. `coin` is null on a miss. */
  land(cell: HwCell, coin: HwCoin<TData> | null): HwEffect<TData>[] {
    // Outside a wave this is a stray landing - a sibling reel settling after
    // the wave was aborted on error, or a cell landing after reset(). Drop it
    // so it can't re-lock a coin into a cleared ledger or resurrect a feature.
    if (this._phase !== 'spinning') return [];
    if (!coin) {
      return [{ type: 'cell:landed', payload: { cell, coin: null } }];
    }
    const stored = this._freeze(cell, coin.id, coin.data);
    this._locked.set(cellKey(cell), stored);
    this._waveLanded.push(stored);
    return [
      { type: 'cell:landed', payload: { cell, coin: stored } },
      {
        type: 'coin:locked',
        payload: { coin: stored, locked: this._locked.size, capacity: this.capacity },
      },
    ];
  }

  /** Close the wave: resolve the counter, detect full / feature end. */
  endWave(): { effects: HwEffect<TData>[]; landed: HwCoin<TData>[] } {
    // The wave was aborted or reset out from under us (see land()'s guard).
    // Closing it would re-arm the counter and flip a finished feature back to
    // active off a wave that no longer exists. Do nothing.
    if (this._phase !== 'spinning') return { effects: [], landed: [] };
    const landed = this._waveLanded;
    const effects: HwEffect<TData>[] = [];
    effects.push(
      landed.length > 0
        ? this._setRespins(this._defaultRespins, 'hit-reset')
        : this._setRespins(this._respinsLeft - 1, 'miss'),
    );
    this._phase = 'active';
    effects.push({
      type: 'respin:end',
      payload: { round: this._round, hits: [...landed], respinsLeft: this._respinsLeft },
    });
    const full = this.isFull;
    if (full) effects.push({ type: 'board:full', payload: { coins: this.lockedCoins() } });
    const done = full || this._respinsLeft <= 0;
    if (done) {
      this._phase = 'idle';
      effects.push({
        type: 'feature:end',
        payload: { coins: this.lockedCoins(), rounds: this._round, full },
      });
    }
    // Hand back a caller-owned copy, not the live `_waveLanded` reference, so a
    // consumer that mutates `respin().hits` can't reach into reducer state. The
    // `respin:end` event payload above is already copied for the same reason.
    return { effects, landed: [...landed] };
  }

  /**
   * Abandon an in-flight wave after a driver error: restore the phase from
   * `spinning` back to `active` so a thrown spin doesn't strand the board (every
   * later `beginWave` would otherwise throw "wave in flight"). Cells that already
   * landed stay locked; the caller decides whether to retry or `reset`.
   */
  abortWave(): void {
    if (this._phase !== 'spinning') return;
    this._phase = 'active';
    this._waveLanded = [];
  }

  /** Remove locked coins - the collect moment. */
  release(cells: HwCell[]): { effects: HwEffect<TData>[]; released: HwCoin<TData>[] } {
    if (this._phase === 'spinning') {
      throw new Error('HoldAndWinBoard: release() while a wave is in flight — await respin() first.');
    }
    const effects: HwEffect<TData>[] = [];
    const released: HwCoin<TData>[] = [];
    for (const cell of cells) {
      const k = cellKey(cell);
      const coin = this._locked.get(k);
      if (!coin) continue;
      this._locked.delete(k);
      released.push(coin);
      effects.push({ type: 'coin:released', payload: { coin, remaining: this._locked.size } });
    }
    return { effects, released };
  }

  /**
   * Wake dormant cells: from now on they spin with the free cells and count
   * toward `capacity`. Already-active cells are ignored. Not allowed mid-wave -
   * the spinning set was fixed when the wave began.
   */
  activate(cells: HwCell[]): HwEffect<TData>[] {
    if (this._phase === 'spinning') {
      throw new Error('HoldAndWinBoard: activate() while a wave is in flight — await respin() first.');
    }
    const woken: HwCell[] = [];
    for (const cell of cells) {
      const k = cellKey(cell);
      this._assertInGrid(cell, 'activate');
      if (!this._inactive.has(k)) continue;
      this._inactive.delete(k);
      woken.push({ reel: cell.reel, cell: cell.cell });
    }
    if (woken.length === 0) return [];
    return [{ type: 'cells:activated', payload: { cells: woken, capacity: this.capacity } }];
  }

  /**
   * Rewrite a **locked** cell's coin identity in place (coin → jackpot, mini →
   * major). Throws on a free cell - placing a brand-new tracked coin out of a
   * spin is `enter`/`respin`'s job; for purely decorative art on a free cell use
   * the cell's reel directly.
   */
  swap(cell: HwCell, id: string, data: TData | undefined): void {
    if (this._phase === 'spinning') {
      throw new Error('HoldAndWinBoard: setSymbolAt() while a wave is in flight — await respin() first.');
    }
    const k = cellKey(cell);
    const prev = this._locked.get(k);
    if (!prev) {
      throw new Error(
        `HoldAndWinBoard: setSymbolAt(${k}) on a non-locked cell — setSymbolAt rewrites a locked coin's identity.`,
      );
    }
    this._locked.set(k, this._freeze(cell, id, data ?? prev.data));
  }

  /**
   * Hard clear back to idle. Fires `feature:reset`, never `coin:released`.
   * Cells activated during the feature go dormant again.
   */
  reset(): HwEffect<TData>[] {
    const clearedCoins = this._locked.size;
    this._locked.clear();
    this._inactive.clear();
    for (const k of this._initialInactive) this._inactive.add(k);
    this._waveLanded = [];
    this._round = 0;
    this._respinsLeft = 0;
    this._phase = 'idle';
    return [{ type: 'feature:reset', payload: { clearedCoins } }];
  }

  // ── Internals ────────────────────────────────────────────────────────

  private _setRespins(value: number, reason: HwRespinReason): HwEffect<TData> {
    this._respinsLeft = Math.max(0, value);
    return { type: 'respins:changed', payload: { value: this._respinsLeft, reason } };
  }

  /**
   * Store a coin with a board-owned, frozen `cell` so the ledger key can never
   * be corrupted by a game mutating the coin it was handed. `data` is left
   * mutable by reference - that is the supported way to carry live value.
   */
  private _freeze(cell: HwCell, id: string, data: TData | undefined): HwCoin<TData> {
    return { cell: Object.freeze({ reel: cell.reel, cell: cell.cell }), id, data };
  }

  private _assertInGrid(cell: HwCell, op: string): void {
    if (!this._cellSet.has(cellKey(cell))) {
      throw new Error(`HoldAndWinBoard: ${op}() targets cell ${cellKey(cell)} outside the grid.`);
    }
  }

  private _assertActive(cell: HwCell, op: string): void {
    this._assertInGrid(cell, op);
    if (this._inactive.has(cellKey(cell))) {
      throw new Error(
        `HoldAndWinBoard: ${op}() targets inactive cell ${cellKey(cell)} — activate() it first.`,
      );
    }
  }
}
