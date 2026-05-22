import type { Ticker } from 'pixi.js';
import type { Reel } from '../core/Reel.js';
import type { SpeedProfile, SpinOptions, SymbolData } from '../config/types.js';
import type { SpeedManager } from '../speed/SpeedManager.js';
import type { FrameBuilder } from '../frame/FrameBuilder.js';
import type { SpinResult } from '../events/ReelEvents.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSetEvents } from '../events/ReelEvents.js';
import { PhaseFactory } from './phases/PhaseFactory.js';
import type { SpinPhase } from './phases/SpinPhase.js';
import type { ReelPhase } from './phases/ReelPhase.js';
import type { StartPhaseConfig } from './phases/StartPhase.js';
import type { StopPhaseConfig } from './phases/StopPhase.js';
import type { AnticipationPhaseConfig } from './phases/AnticipationPhase.js';
import type { AdjustPhaseConfig } from './phases/AdjustPhase.js';
import type { CascadeFallPhaseConfig } from './phases/CascadeFallPhase.js';
import type { CascadePlacePhaseConfig } from './phases/CascadePlacePhase.js';
import type { CascadeDropInPhaseConfig } from './phases/CascadeDropInPhase.js';
import type { SpinningMode } from './modes/SpinningMode.js';
import { StandardMode } from './modes/StandardMode.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';
import { OCCUPIED_SENTINEL } from '../core/Reel.js';
import type { CellPin } from '../pins/CellPin.js';
import { columnTargetToArray } from '../frame/ColumnTarget.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import type { Cell } from '../cascade/tumbleAlgorithm.js';

/**
 * MultiWays/big-symbol coordination hook injected by `ReelSet` into
 * `SpinController`. All callbacks are no-ops (and `isMultiWaysSlot=false`)
 * for non-MultiWays slots, so the standard chain is unchanged.
 */
export interface SpinControllerHooks {
  isMultiWaysSlot: boolean;
  symbolsData: Record<string, SymbolData>;
  /** Read pending MultiWays shape. Returns null when no shape is pending. */
  peekTargetShape(): number[] | null;
  /** Clear pending shape after AdjustPhase runs. */
  clearTargetShape(): void;
  /** Reel pixel-box height for MultiWays cell-height derivation. */
  multiwaysReelPixelHeight: number;
  symbolGapY: number;
  /** Reel-scoped pin lookup. Used to build AdjustPhase tween descriptors. */
  getPinsOnReel(reelIndex: number): CellPin[];
  /**
   * Migrate pins on a reel to a new visible-row count, returning the
   * resulting moves. Mutates the pin map directly inside ReelSet.
   */
  migratePinsForReel(reelIndex: number, newRows: number): {
    pin: CellPin;
    fromRow: number;
    toRow: number;
    clamped: boolean;
  }[];
  /**
   * Reposition + resize every pin overlay on the given reel. Called after
   * AdjustPhase commits a MultiWays reshape so overlays move to their new
   * (post-migration) row at the new cell size.
   */
  refreshPinOverlaysForReel(reelIndex: number): void;
  /**
   * Build AdjustPhase pin-overlay tween descriptors for a reel — one per
   * active pin overlay. Captures pre-reshape (current) Y/size from the
   * overlay and computes post-reshape target. Called BEFORE the reshape
   * commits so the "from" state reflects what's actually on screen.
   */
  buildPinOverlayTweens(
    reelIndex: number,
    targetSymbolHeight: number,
    symbolGapY: number,
  ): import('./phases/AdjustPhase.js').PinOverlayTween[];
}

/**
 * The conductor of a spin.
 *
 * A reel set has many moving parts; the `SpinController` is the single
 * brain that drives them in time. On `spin()` it walks every reel through
 * its phase state machine (`StartPhase` → `SpinPhase` → optional
 * `AnticipationPhase` → `StopPhase`), applies the per-reel staggered
 * delays from the `SpeedProfile`, and resolves a promise when the last
 * reel lands (or the spin is skipped).
 *
 * It does not draw anything — drawing lives on `Reel` and `ReelSymbol`.
 * It does not decide outcomes — that's `setResult(grid)` coming in from
 * your game code. Its one job is timing.
 *
 * Every interesting moment fires on the event bus:
 *   `spin:start`, `spin:allStarted`, `spin:stopping`, `spin:reelLanded`,
 *   `spin:allLanded`, `spin:complete`, `skip:requested`, `skip:completed`.
 */
export class SpinController implements Disposable {
  private _reels: Reel[];
  private _speedManager: SpeedManager;
  private _frameBuilder: FrameBuilder;
  private _phaseFactory: PhaseFactory;
  private _events: EventEmitter<ReelSetEvents>;
  private _tickerRef: TickerRef;
  private _spinningMode: SpinningMode;
  private _defaultSpinMode: 'standard' | 'cascade';
  private _currentSpinMode: 'standard' | 'cascade' = 'standard';
  private _hooks: SpinControllerHooks;

  private _isSpinning = false;
  private _spinStartTime = 0;
  private _resultSymbols: string[][] | null = null;
  private _anticipationReels: number[] = [];
  private _stopDelayOverride: number[] | null = null;
  private _activePhases: Map<number, ReelPhase<any>> = new Map();
  private _landedReels = new Set<number>();
  /**
   * Reels held for the current spin (per `SpinOptions.holdReels`). Held
   * reels skip START / SPIN / STOP and stay on their current symbols.
   * Cleared at the start of every spin.
   */
  private _heldReels = new Set<number>();
  private _wasSkipped = false;
  private _skipPending = false;
  private _isDestroyed = false;
  private _currentSpinResolve: ((result: SpinResult) => void) | null = null;
  /** Incremented on each new spin. If a callback sees a stale generation, it no-ops. */
  private _spinGeneration = 0;
  /**
   * Round-aware `skip()` state. Lives across `refill()` calls within a
   * round (one `spin()` + its cascade refills) and resets on the next
   * `spin()`.
   *
   * `0` — no press yet this round.
   * `2` — a press has slammed (and applied the round's side effect: a
   *       speed boost in standard mode or auto-slam-refills in cascade).
   *       Subsequent presses also slam.
   *
   * `1` is reserved (kept for forward compat in the type) but currently
   * unreachable — every press slams now, side effects are applied on the
   * first press together with the slam.
   */
  private _skipStage: 0 | 1 | 2 = 0;
  /**
   * Speed profile name that was active when the round-start boost fired,
   * captured so the next `spin()` can restore it. `null` between rounds and
   * during rounds where the player never pressed skip.
   */
  private _skipPreviousSpeedName: string | null = null;
  /**
   * Speed profile name we boosted INTO. Kept for telemetry / debugging;
   * the restore decision uses `_manualSpeedSinceBoost` instead, which
   * correctly distinguishes "user didn't touch speed" from "user happened
   * to manually re-set to the boosted value" (the activeName check alone
   * can't tell those apart).
   */
  private _skipBoostedToName: string | null = null;
  /**
   * `true` when the app called `setSpeed()` between the round-start boost
   * and the next `spin()` — i.e. the user made an explicit speed choice
   * after the boost. The next `spin()` restore path checks this flag and
   * SKIPS the restore so the manual choice survives, even if the manual
   * choice happens to be the same name we boosted into.
   *
   * Set by `notifyManualSpeedChange()` (called from `ReelSet.setSpeed`).
   * Cleared at the start of every `spin()` together with the boost
   * bookkeeping.
   */
  private _manualSpeedSinceBoost = false;
  /**
   * Cascade-mode round flag. When true, the next `refill()` skips its
   * phase chain and slams instantly. Set when the player presses `skip()`
   * during a cascade round (one press = "fast-forward to end of round").
   * Cleared on the next `spin()` alongside the rest of the stage state.
   */
  private _autoSlamRefills = false;

  constructor(
    reels: Reel[],
    speedManager: SpeedManager,
    frameBuilder: FrameBuilder,
    phaseFactory: PhaseFactory,
    events: EventEmitter<ReelSetEvents>,
    ticker: Ticker,
    spinningMode?: SpinningMode,
    defaultSpinMode: 'standard' | 'cascade' = 'standard',
    hooks?: SpinControllerHooks,
  ) {
    this._reels = reels;
    this._speedManager = speedManager;
    this._frameBuilder = frameBuilder;
    this._phaseFactory = phaseFactory;
    this._events = events;
    this._tickerRef = new TickerRef(ticker);
    this._spinningMode = spinningMode ?? new StandardMode();
    this._defaultSpinMode = defaultSpinMode;
    this._hooks = hooks ?? {
      isMultiWaysSlot: false,
      symbolsData: {},
      peekTargetShape: () => null,
      clearTargetShape: () => {},
      multiwaysReelPixelHeight: 0,
      symbolGapY: 0,
      getPinsOnReel: () => [],
      migratePinsForReel: () => [],
      refreshPinOverlaysForReel: () => {},
      buildPinOverlayTweens: () => [],
    };

    this._tickerRef.add((ticker) => this._onTick(ticker));
  }

  get isSpinning(): boolean {
    return this._isSpinning;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Current `skip()` position within the active round. `0` until the
   * player presses the slam button, `2` after. Use to drive UI button
   * labels (e.g. "Skip" → "Skipped"). `1` is reserved for forward compat
   * and is not currently reachable.
   */
  get skipStage(): 0 | 1 | 2 {
    return this._skipStage;
  }

  async spin(options?: SpinOptions): Promise<SpinResult> {
    if (this._isSpinning) {
      throw new Error('Cannot start a new spin while one is in progress.');
    }

    const mode = options?.mode ?? this._defaultSpinMode;
    if (mode === 'cascade' && !this._phaseFactory.has('cascade:fall')) {
      throw new Error(
        "spin({ mode: 'cascade' }) requires .tumble(...) on the builder.",
      );
    }
    this._currentSpinMode = mode;

    // Round boundary: a new `spin()` ends the previous round. If the
    // player boosted via `skip()` last round AND did NOT manually call
    // `setSpeed()` between rounds, restore the pre-boost speed. The
    // manual-flag check is what distinguishes "user untouched, restore"
    // from "user explicitly chose the boosted name, leave alone" — the
    // activeName comparison alone can't tell those apart.
    if (this._skipPreviousSpeedName !== null) {
      const prev = this._skipPreviousSpeedName;
      this._skipPreviousSpeedName = null;
      this._skipBoostedToName = null;
      if (!this._manualSpeedSinceBoost && this._speedManager.activeName !== prev) {
        this._speedManager.set(prev);
      }
    }
    this._manualSpeedSinceBoost = false;
    this._skipStage = 0;
    this._autoSlamRefills = false;

    this._isSpinning = true;
    this._wasSkipped = false;
    this._skipPending = false;
    this._spinStartTime = performance.now();
    this._resultSymbols = null;
    this._anticipationReels = [];
    // NOTE: _stopDelayOverride is NOT cleared here. The contract is that
    // `setDropOrder()` (or `setStopDelays()`) is called right before
    // `spin()` / `refill()` and represents user intent for the upcoming
    // sequence. Clearing it on entry would silently drop the value the
    // user just set. The override persists until the next setDropOrder()
    // call overwrites it.
    this._landedReels.clear();
    this._activePhases.clear();
    this._heldReels = this._normalizeHoldReels(options?.holdReels);
    this._spinGeneration++;

    const generation = this._spinGeneration;
    const speed = this._speedManager.active;

    this._events.emit('spin:start');

    const resultPromise = new Promise<SpinResult>((resolve) => {
      this._currentSpinResolve = resolve;
    });

    // Degenerate case: every reel held → resolve next microtask with the
    // current visible grid. Spin emitted, but no animation runs.
    if (this._heldReels.size === this._reels.length) {
      Promise.resolve().then(() => {
        if (generation !== this._spinGeneration) return;
        this._finishSpin();
      });
      return resultPromise;
    }

    for (let i = 0; i < this._reels.length; i++) {
      if (this._heldReels.has(i)) continue;
      this._runReelTask(this._startReel(i, speed, generation), 'spin', i, generation);
    }

    return resultPromise;
  }

  /**
   * Wrap a per-reel async phase chain with an error guard. If the chain
   * rejects we log the error and force a slam so:
   *   1. the spin promise resolves with `wasSkipped: true` instead of
   *      hanging forever waiting for the failed reel to land,
   *   2. every other reel is brought to a clean landed state,
   *   3. the next `spin()` / `refill()` starts from a coherent snapshot.
   *
   * Generation-guarded so a late rejection from a stale spin (one that
   * was already replaced by a fresh `spin()` call) is dropped silently.
   */
  private _runReelTask(
    p: Promise<void>,
    kind: 'spin' | 'refill',
    reelIndex: number,
    generation: number,
  ): void {
    p.catch((err: unknown) => {
      if (generation !== this._spinGeneration) return;
      // eslint-disable-next-line no-console
      console.error(
        `[pixi-reels] reel ${reelIndex} (${kind}) phase chain threw — slamming to recover:`,
        err,
      );
      this._slam();
    });
  }

  /**
   * Filter `holdReels` down to a clean Set: drop out-of-range, drop
   * duplicates, drop non-integer entries. Returning a normalized set
   * makes every internal call site safe to read without re-validating.
   */
  private _normalizeHoldReels(input: number[] | undefined): Set<number> {
    const out = new Set<number>();
    if (!input) return out;
    for (const i of input) {
      if (Number.isInteger(i) && i >= 0 && i < this._reels.length) {
        out.add(i);
      }
    }
    return out;
  }

  setResult(symbols: string[][]): void {
    if (!this._isSpinning) return;
    // Fail-fast: validate big-symbol block fit so setResult throws at the
    // call site rather than later inside skip()/_tryBeginStopSequence().
    const visibleRowsForReel = (i: number): number => {
      const pendingShape = this._hooks.peekTargetShape();
      return pendingShape ? pendingShape[i] : this._reels[i].visibleRows;
    };
    this._coordinateBigSymbols(symbols, visibleRowsForReel);
    this._resultSymbols = symbols;
    this._tryBeginStopSequence();
    if (this._skipPending) {
      // Deferred `requestSkip()` is an explicit slam intent — bypass the
      // two-stage `skip()` machine and slam directly.
      this._skipPending = false;
      this._slam();
      this._skipStage = 2;
    }
  }

  /**
   * Tumble cascade: place + drop-in for a refill (Moment B). Skips the
   * fall and the wait-for-result — the caller already cleared the winning
   * cells in user code and is now handing us the next grid directly.
   *
   * Two refill modes:
   *
   *   - `'combined'` (default) — survivors and new symbols animate together
   *     in one drop-in phase. The classic Sweet Bonanza / Sugar Rush feel.
   *   - `'gravity-then-drop'` — survivors slide down to fill holes FIRST
   *     (gravity stage), then a global hold, then new symbols drop in from
   *     above (drop-in stage). The Mummyland Treasures / Reactoonz feel —
   *     gives space for anticipation visuals between the two beats. Per-reel
   *     stop delays (`setDropOrder`) apply to the drop-in stage only; the
   *     gravity stage runs simultaneously across all reels.
   *
   * The hold between gravity and drop-in is the **max** of three sources
   * (Promise.all semantics — whichever finishes LAST gates the drop-in):
   *
   *   - `gravityHoldMs` (default `250`) — fixed wall-clock pause via setTimeout.
   *   - `gravityHold: Promise<void>` — caller-supplied promise. Use when you
   *     already have an in-flight animation/SFX/etc. and want to wait for it
   *     by handle rather than wrapping in a callback.
   *   - `onGravityComplete: () => Promise<void> | void` — callback invoked
   *     at the gravity-end boundary; its returned promise is awaited.
   *
   * `gravityHoldMs` and `gravityHold` race in parallel (Promise.all of the
   * two — both must finish before drop-in starts). `onGravityComplete` runs
   * AFTER both complete, so it can read final state of whatever they were
   * waiting on.
   *
   * Throws if a spin or refill is already in flight, if `.tumble(...)` was
   * not configured on the builder, if the grid shape doesn't match the
   * reel set, or if any winner cell is out of range. All validation runs
   * BEFORE the spinning state is taken so a thrown error leaves the engine
   * idle (callers can retry without re-entry errors).
   */
  async refill(opts: {
    winners: ReadonlyArray<Cell>;
    grid: ColumnTarget[];
    mode?: 'combined' | 'gravity-then-drop';
    gravityHoldMs?: number;
    /**
     * Promise (or zero-arg factory) gating the drop-in stage. Pass a
     * factory function — `() => Promise<void>` — to defer creation until
     * the engine actually reaches the gravity-end boundary; the side
     * effect of building the promise (e.g. starting a multiplier
     * animation) then lines up with the gravity-end beat the player sees.
     * Pass a bare `Promise<void>` if you already have an in-flight
     * animation handle you just want the engine to wait on.
     */
    gravityHold?: Promise<void> | (() => Promise<void>);
    onGravityComplete?: () => Promise<void> | void;
  }): Promise<SpinResult> {
    if (this._isSpinning) {
      throw new Error('Cannot refill while a spin or refill is in progress.');
    }
    if (!this._phaseFactory.has('cascade:place')) {
      throw new Error('refill() requires .tumble(...) on the builder.');
    }

    // Materialize the column targets into the legacy `string[][]` form the
    // internal pipeline runs on. Per-column length checks read off the
    // normalized form.
    const normalizedGrid = opts.grid.map(columnTargetToArray);
    if (normalizedGrid.length !== this._reels.length) {
      throw new RangeError(
        `refill: grid has ${normalizedGrid.length} column(s) but the reel set has ` +
        `${this._reels.length}.`,
      );
    }
    for (let i = 0; i < normalizedGrid.length; i++) {
      const expected = this._reels[i].visibleRows;
      if (normalizedGrid[i].length !== expected) {
        throw new RangeError(
          `refill: grid column ${i} has ${normalizedGrid[i].length} row(s) but ` +
          `reel ${i} has ${expected} visible row(s).`,
        );
      }
    }
    for (const w of opts.winners) {
      if (!Number.isInteger(w.reel) || w.reel < 0 || w.reel >= this._reels.length) {
        throw new RangeError(
          `refill: winner.reel ${w.reel} out of range [0, ${this._reels.length}).`,
        );
      }
      const rows = this._reels[w.reel].visibleRows;
      if (!Number.isInteger(w.row) || w.row < 0 || w.row >= rows) {
        throw new RangeError(
          `refill: winner.row ${w.row} out of range [0, ${rows}) for reel ${w.reel}.`,
        );
      }
    }

    this._isSpinning = true;
    this._wasSkipped = false;
    this._skipPending = false;
    this._spinStartTime = performance.now();
    this._resultSymbols = null;
    this._anticipationReels = [];
    // _stopDelayOverride preserved across entry — see spin() for rationale.
    // Cascade recipes set `setDropOrder('all')` right before refill() and
    // would otherwise see their setting clobbered, falling back to the
    // default `i * speed.stopDelay` left-to-right stagger.
    this._landedReels.clear();
    this._activePhases.clear();
    this._heldReels = new Set();
    this._spinGeneration++;
    this._currentSpinMode = 'cascade';

    const generation = this._spinGeneration;
    const speed = this._speedManager.active;

    // Normalize grid + build per-reel frames upfront. No waiting on
    // `setResult` here — the caller provided everything. Reuses the
    // already-validated `normalizedGrid` from the entry guards.
    this._resultSymbols = normalizedGrid;
    const decorated = this._coordinateBigSymbols(normalizedGrid, (i) => this._reels[i].visibleRows);
    const frames: string[][] = [];
    for (let i = 0; i < this._reels.length; i++) {
      const reel = this._reels[i];
      frames.push(
        this._frameBuilder.build(i, reel.visibleRows, reel.bufferAbove, reel.bufferBelow, decorated[i]),
      );
    }
    this._cachedFrames = frames;

    // Group winners per reel and sort ascending — the gravity algorithm
    // expects ascending winner rows when it builds nonWinnerRows.
    const winnersByReel = new Map<number, number[]>();
    for (const w of opts.winners) {
      let arr = winnersByReel.get(w.reel);
      if (!arr) {
        arr = [];
        winnersByReel.set(w.reel, arr);
      }
      arr.push(w.row);
    }
    for (const arr of winnersByReel.values()) arr.sort((a, b) => a - b);

    this._events.emit('spin:start');

    const resultPromise = new Promise<SpinResult>((resolve) => {
      this._currentSpinResolve = resolve;
    });

    // Auto-slam: skip() set this earlier in the round to mean "fast-forward
    // the rest of this cascade." Bypass the place + dropIn phase chain and
    // land instantly — `_slam()` sees no active phases, `_resultSymbols` is
    // set, and per-reel placement happens synchronously.
    if (this._autoSlamRefills) {
      this._slam();
      this._skipStage = 2;
      return resultPromise;
    }

    const mode = opts.mode ?? 'combined';

    if (mode === 'gravity-then-drop') {
      // Two-stage orchestration. All reels do place + gravity in parallel
      // (no per-reel stop delay — gravity is a global "settling" beat,
      // not a reveal). Once every reel's gravity is done, wait for the
      // combined hold (Promise.all of `gravityHoldMs` setTimeout +
      // optional `gravityHold` promise + optional `onGravityComplete`
      // callback's returned promise), then start the drop-in stage with
      // the user's per-reel stop delays applied.
      const gravityHoldMs = opts.gravityHoldMs ?? 250;
      this._refillTwoStage(
        speed,
        generation,
        winnersByReel,
        gravityHoldMs,
        opts.gravityHold,
        opts.onGravityComplete,
      ).catch((err: unknown) => {
        if (generation !== this._spinGeneration) return;
        // The likely culprits at this layer are a `gravityHold` promise
        // (or factory) rejection and an `onGravityComplete` callback
        // throw. Surface BOTH a structured event (so a HUD / error
        // reporter can react) AND a console.error (so an unhandled
        // user-code rejection still leaves an obvious diagnostic).
        // We still slam so the engine returns to a coherent idle state
        // — without this the refill promise would hang forever.
        this._events.emit('cascade:gravity:error', { error: err });
        // eslint-disable-next-line no-console
        console.error(
          '[pixi-reels] two-stage refill threw (likely from a user-supplied ' +
          'gravityHold/onGravityComplete) — slamming to recover:',
          err,
        );
        this._slam();
      });
    } else {
      for (let i = 0; i < this._reels.length; i++) {
        const winnerRows = winnersByReel.get(i) ?? [];
        this._runReelTask(this._refillReel(i, speed, generation, winnerRows), 'refill', i, generation);
      }
    }

    return resultPromise;
  }

  private async _refillReel(
    reelIndex: number,
    speed: SpeedProfile,
    generation: number,
    winnerRows: number[],
  ): Promise<void> {
    if (generation !== this._spinGeneration) return;

    const reel = this._reels[reelIndex];
    const targetFrame = this._frameFor(reelIndex);
    const stopDelay = this._stopDelayFor(reelIndex, speed);

    const placePhase = this._phaseFactory.create<any>('cascade:place', reel, speed);
    this._activePhases.set(reelIndex, placePhase);
    await placePhase.run({
      targetFrame,
      winnerRows,
      initial: false,
      delay: stopDelay,
      events: this._events,
    } satisfies CascadePlacePhaseConfig);
    if (generation !== this._spinGeneration) return;

    const dropInPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
    this._activePhases.set(reelIndex, dropInPhase);
    await dropInPhase.run({
      winnerRows,
      initial: false,
      events: this._events,
    } satisfies CascadeDropInPhaseConfig);
    if (generation !== this._spinGeneration) return;

    this._markLanded(reelIndex);
  }

  /**
   * Two-stage refill: place + gravity (all reels parallel, no stop delay),
   * global hold, then drop-in (all reels parallel, with stop delays).
   * Survivors slide first; new symbols enter after the hold. See `refill`
   * for the player-facing description.
   */
  private async _refillTwoStage(
    speed: SpeedProfile,
    generation: number,
    winnersByReel: Map<number, number[]>,
    gravityHoldMs: number,
    gravityHold?: Promise<void> | (() => Promise<void>),
    onGravityComplete?: () => Promise<void> | void,
  ): Promise<void> {
    // Stage 1 — place + gravity. Place phase runs with delay = 0 so all
    // reels swap identities in lockstep; the staggered "reveal" lives in
    // stage 2.
    const stage1 = this._reels.map(async (_, i) => {
      if (generation !== this._spinGeneration) return;
      const reel = this._reels[i];
      const targetFrame = this._frameFor(i);
      const winnerRows = winnersByReel.get(i) ?? [];

      const placePhase = this._phaseFactory.create<any>('cascade:place', reel, speed);
      this._activePhases.set(i, placePhase);
      await placePhase.run({
        targetFrame,
        winnerRows,
        initial: false,
        delay: 0,
        events: this._events,
      } satisfies CascadePlacePhaseConfig);
      if (generation !== this._spinGeneration) return;

      const gravityPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
      this._activePhases.set(i, gravityPhase);
      await gravityPhase.run({
        winnerRows,
        initial: false,
        role: 'gravity',
        events: this._events,
      } satisfies CascadeDropInPhaseConfig);
    });
    await Promise.all(stage1);
    if (generation !== this._spinGeneration) return;

    // Global hold — the beat where the player reads "the wins are gone, the
    // surviving symbols have settled" and any user-code anticipation
    // visuals (multiplier bump, mascot react) play. Two sources race in
    // PARALLEL via Promise.all: a fixed `gravityHoldMs` setTimeout and a
    // caller-supplied `gravityHold` promise. Whichever finishes last gates
    // the drop-in — pass both when you want a min-wall-clock floor under
    // an animation that might be fast. Skip during this window bumps the
    // generation; the post-await guard bails before the drop-in stage.
    //
    // `gravityHold` accepts a factory (`() => Promise<void>`) so that its
    // side effects (e.g. starting a multiplier-roll animation) fire HERE,
    // at gravity-end — not back when the refill args were assembled. A
    // bare Promise is also accepted for callers that already hold an
    // in-flight handle.
    const holdPromises: Promise<void>[] = [];
    if (gravityHoldMs > 0) {
      holdPromises.push(new Promise<void>((r) => setTimeout(r, gravityHoldMs)));
    }
    if (gravityHold) {
      holdPromises.push(typeof gravityHold === 'function' ? gravityHold() : gravityHold);
    }
    if (holdPromises.length > 0) {
      await Promise.all(holdPromises);
      if (generation !== this._spinGeneration) return;
    }

    // Awaitable callback — runs AFTER the parallel hold sources resolve,
    // so it can read final state of whatever they were waiting on
    // (e.g. a multiplier display that just finished counting up). Errors
    // are surfaced so the caller's bug doesn't silently hang the drop-in
    // stage forever; the catch bumps the generation, which causes the
    // post-await guard to bail and `_finishSpin` will be triggered by the
    // slam path if user code calls skip() in response.
    if (onGravityComplete) {
      await onGravityComplete();
      if (generation !== this._spinGeneration) return;
    }

    // Stage 2 — drop-in (new symbols only). Per-reel stop delays apply
    // here so `setDropOrder('ltr', step)` produces the column-by-column
    // refill wave. The drop-in phase calls `notifyLanded` when its tween
    // completes, which marks the reel landed and resolves `refill()`.
    for (let i = 0; i < this._reels.length; i++) {
      this._runReelTask(
        this._refillReelDropInOnly(i, speed, generation, winnersByReel.get(i) ?? []),
        'refill',
        i,
        generation,
      );
    }
  }

  private async _refillReelDropInOnly(
    reelIndex: number,
    speed: SpeedProfile,
    generation: number,
    winnerRows: number[],
  ): Promise<void> {
    if (generation !== this._spinGeneration) return;

    const reel = this._reels[reelIndex];
    const stopDelay = this._stopDelayFor(reelIndex, speed);

    // setDropOrder produces per-reel start delays; honour them here as a
    // sleep before kicking off the drop-in phase. Sleeping outside the
    // phase keeps the phase API simple — it doesn't need its own delay
    // parameter (Phase delay is a CascadePlacePhase concern).
    if (stopDelay > 0) {
      await new Promise<void>((r) => setTimeout(r, stopDelay));
      if (generation !== this._spinGeneration) return;
    }

    const dropInPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
    this._activePhases.set(reelIndex, dropInPhase);
    await dropInPhase.run({
      winnerRows,
      initial: false,
      role: 'new',
      events: this._events,
    } satisfies CascadeDropInPhaseConfig);
    if (generation !== this._spinGeneration) return;

    this._markLanded(reelIndex);
  }

  setAnticipation(reelIndices: number[]): void {
    // Held reels never reach AnticipationPhase, but filter here too so the
    // public API is forgiving — callers can pass a flat list without
    // tracking which indices are held this spin.
    this._anticipationReels = reelIndices.filter((i) => !this._heldReels.has(i));
  }

  /**
   * Override the per-reel stop delay (in ms). Pass one value per reel.
   * When set, these replace the staggered `reelIndex * speed.stopDelay`
   * pattern for the current spin. Cleared at the start of each new spin.
   */
  setStopDelays(delays: number[]): void {
    this._stopDelayOverride = [...delays];
  }

  /**
   * Slam-stop safe before `setResult()` arrives. Queues until a result is
   * set, then slams. Bypasses the two-stage `skip()` machine — this API is
   * for callers with explicit slam intent (e.g. UIs that wire the queued
   * slam separately from a stage-aware button).
   */
  requestSkip(): void {
    if (!this._isSpinning) return;
    if (this._resultSymbols) {
      this._slam();
      this._skipStage = 2;
      return;
    }
    this._skipPending = true;
  }

  /**
   * Round-aware skip — the button-press entry point used by the universal
   * "spin/skip" button pattern across recipes. First press in a round
   * slams the current drop AND applies the round's speed effect as a
   * side-effect:
   *
   *   - Standard mode: boost the active speed profile to the fastest
   *     registered one and emit `skip:boosted`. The speed change takes
   *     effect on subsequent spins (mid-spin speed switching is not
   *     supported by phases). Restored to the player's original profile
   *     on the next `spin()`.
   *   - Cascade/tumble mode: flag the round so every subsequent
   *     `refill()` auto-slams instantly (no animation). One press ends
   *     a multi-drop cascade round.
   *
   * Subsequent presses in the same round slam each current drop.
   *
   * Throws if called before `setResult()` arrives (no result to slam onto
   * — slamming now would land the reels on the random spin-buffer state).
   * Use {@link requestSkip} for the deferred slam pattern: it queues the
   * slam and fires it the moment `setResult()` arrives, so the reels land
   * on the intended grid. (Refill paths set the result at entry, so this
   * guard fires only during the pre-`setResult` window of `spin()`.)
   *
   * Callers who want only the slam without the boost or auto-slam side
   * effects (tests, anti-cheat, programmatic automation) should use
   * `slamStop()` instead.
   */
  skip(): void {
    if (!this._isSpinning) return;

    // Pre-result guard. Slamming before setResult() lands on the random
    // spin-buffer state (standard mode = random visible grid; cascade
    // mode = alpha-0 fall-out residue, i.e. invisible). Both are wrong;
    // fail loud and steer the caller to `requestSkip()` which queues the
    // intent until setResult arrives.
    //
    // Held-only spins (every reel held) resolve on a microtask without
    // ever taking a result and never reach this branch.
    if (!this._resultSymbols) {
      throw new Error(
        'skip() called before setResult() — there is nothing to land on yet ' +
        '(standard mode would land on random buffer fill; cascade mode would land ' +
        "invisible). Use reelSet.requestSkip() to queue the slam until setResult() " +
        'arrives, or wait for setResult() before calling skip().',
      );
    }

    if (this._skipStage === 0) {
      if (this._currentSpinMode === 'cascade') {
        // Cascade: phase durations are static (don't read `speed.spinSpeed`),
        // so a boost would be invisible. Auto-slam future refills instead.
        this._autoSlamRefills = true;
      } else {
        // Standard: try to boost speed for the rest of the round. If the
        // active profile is already the fastest (or only one is registered),
        // we just slam — no boost is observable.
        const fastest = this._findFastestSpeedName();
        if (fastest !== null && fastest !== this._speedManager.activeName) {
          const { previous, current } = this._speedManager.set(fastest);
          this._skipPreviousSpeedName = previous.name;
          this._skipBoostedToName = current.name;
          this._events.emit('skip:boosted', { previous, current });
        }
      }
    }

    this._slam();
    this._skipStage = 2;
  }

  /**
   * Hard slam-stop. Always lands every un-landed reel immediately, regardless
   * of stage. Sets `skipStage` to 2 so future `skip()` presses in this round
   * also slam (the boost ship has sailed).
   */
  slamStop(): void {
    if (!this._isSpinning) return;
    this._slam();
    this._skipStage = 2;
  }

  /**
   * The slam path itself: force-complete active phases, place results (or
   * snap to current symbols when no result is set), mark every un-landed
   * reel as landed. Shared by `skip()` (stage 1+), `requestSkip()`'s
   * deferred path, `slamStop()`, and the per-reel error-recovery path
   * inside `_runReelTask`.
   *
   * Idempotent: a second call once the spin has finished is a no-op. Lets
   * cascading rejection handlers each safely invoke `_slam` without
   * triple-emitting `skip:requested`.
   */
  private _slam(): void {
    if (!this._isSpinning) return;
    this._wasSkipped = true;
    this._events.emit('skip:requested');

    for (const [, phase] of this._activePhases) {
      phase.forceComplete();
    }
    this._activePhases.clear();

    this._spinGeneration++;

    if (this._resultSymbols) {
      // MultiWays skip: apply pending shape and big-symbol coordinator before
      // placement so reels land at the new shape with OCCUPIED sentinels.
      const pendingShape = this._hooks.peekTargetShape();
      const visibleRowsForReel = (i: number): number =>
        pendingShape ? pendingShape[i] : this._reels[i].visibleRows;
      const decorated = this._coordinateBigSymbols(this._resultSymbols, visibleRowsForReel);

      for (let i = 0; i < this._reels.length; i++) {
        if (this._landedReels.has(i)) continue;
        if (this._heldReels.has(i)) continue;
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;

        if (this._hooks.isMultiWaysSlot && pendingShape) {
          // Pin migration already ran at setShape() time; reshape via the
          // shared helper that both paths use. No tween — skip is instant.
          //
          // Edge case: pins exist but the shape didn't change (`pendingShape`
          // is null). We don't refresh overlays here because they're about
          // to be destroyed in `_onSpinLanded` anyway — the cell symbols at
          // the pinned coords land via `placeSymbols(decorated[i])` below
          // and overlay the same id, so the player sees the right thing.
          // `pinMigrationDuration` doesn't apply on skip by design (slam
          // stop is meant to land *now*, not run a tween on the way there).
          this._applyReshape(i, pendingShape[i]);
        }

        reel.placeSymbols(decorated[i]);
        reel.notifySpinEnd();
        reel.notifyLanded();
        this._markLanded(i);
      }
    } else {
      for (let i = 0; i < this._reels.length; i++) {
        if (this._landedReels.has(i)) continue;
        if (this._heldReels.has(i)) continue;
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;
        reel.snapToGrid();
        reel.notifySpinEnd();
        reel.notifyLanded();
        this._markLanded(i);
      }
    }

    this._events.emit('skip:completed');
  }

  /**
   * Called by `ReelSet.setSpeed()` after the speed manager applies a
   * user-driven profile change. Sets the flag the next `spin()` checks
   * to decide whether to undo a prior `skip()` boost. Internal-only —
   * not part of the SpinController public API.
   *
   * Idempotent if no boost is pending (the flag is consulted only when
   * `_skipPreviousSpeedName !== null`).
   */
  notifyManualSpeedChange(): void {
    this._manualSpeedSinceBoost = true;
  }

  /**
   * Pick the registered speed profile with the highest `spinSpeed` (pixels
   * per frame at full motion). Returns `null` if only one profile exists,
   * since a "boost to yourself" is meaningless.
   */
  private _findFastestSpeedName(): string | null {
    const names = this._speedManager.profileNames;
    if (names.length < 2) return null;
    let bestName: string | null = null;
    let bestSpeed = -Infinity;
    for (const name of names) {
      const p = this._speedManager.getProfile(name);
      if (!p) continue;
      if (p.spinSpeed > bestSpeed) {
        bestSpeed = p.spinSpeed;
        bestName = name;
      }
    }
    return bestName;
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._tickerRef.destroy();
    this._activePhases.clear();
    this._isDestroyed = true;
  }

  /**
   * Compute the target cell height for a reel given a target row count.
   * MultiWays slots derive cell height from the fixed `multiwaysReelPixelHeight`;
   * non-MultiWays slots return the reel's current `symbolHeight` unchanged.
   */
  private _targetCellHeightFor(reel: Reel, targetRows: number): number {
    if (this._hooks.multiwaysReelPixelHeight <= 0) return reel.symbolHeight;
    return (this._hooks.multiwaysReelPixelHeight - (targetRows - 1) * this._hooks.symbolGapY) / targetRows;
  }

  /**
   * Commit a reshape on one reel: emit `adjust:start`, call `reel.reshape()`,
   * refresh pin overlays, emit `adjust:complete`. Returns whether work was
   * actually done.
   *
   * **The single source of truth** for reshape orchestration — both the
   * normal AdjustPhase path AND the skip path call this. Avoids the
   * "two parallel implementations" bug magnet that previously had each
   * path duplicating the same compute-target-height + reshape + refresh +
   * emit-events logic.
   *
   * Pin migration already happened at `setShape()` time, so this method
   * only handles geometry + overlays.
   */
  private _applyReshape(reelIndex: number, targetRows: number): boolean {
    const reel = this._reels[reelIndex];
    const targetCellH = this._targetCellHeightFor(reel, targetRows);
    const fromRows = reel.visibleRows;

    if (targetRows === fromRows && targetCellH === reel.symbolHeight) {
      return false;
    }

    this._events.emit('adjust:start', { reelIndex, fromRows, toRows: targetRows });
    reel.reshape(targetRows, targetCellH, reel.bufferAbove, reel.bufferBelow);
    this._hooks.refreshPinOverlaysForReel(reelIndex);
    this._events.emit('adjust:complete', { reelIndex });
    return true;
  }

  // ── Internal ──────────────────────────────────────────

  private async _startReel(reelIndex: number, speed: SpeedProfile, generation: number): Promise<void> {
    if (generation !== this._spinGeneration) return;

    const reel = this._reels[reelIndex];
    const isTumble = this._currentSpinMode === 'cascade';

    // START or FALL: chain via phase.run() promises (no busy-polling).
    if (isTumble) {
      const fallPhase = this._phaseFactory.create<any>('cascade:fall', reel, speed);
      this._activePhases.set(reelIndex, fallPhase);
      await fallPhase.run({
        spinningMode: this._spinningMode,
        delay: reelIndex * speed.spinDelay,
        events: this._events,
      } satisfies CascadeFallPhaseConfig);
    } else {
      const startPhase = this._phaseFactory.create<any>('start', reel, speed);
      this._activePhases.set(reelIndex, startPhase);
      await startPhase.run({
        spinningMode: this._spinningMode,
        delay: reelIndex * speed.spinDelay,
      } satisfies StartPhaseConfig);
    }

    if (generation !== this._spinGeneration) return;

    const spinPhase = this._phaseFactory.create<SpinPhase>('spin', reel, speed);
    this._activePhases.set(reelIndex, spinPhase);
    const spinDone = spinPhase.run({});

    let allSpinning = true;
    for (let i = 0; i < this._reels.length; i++) {
      // Held reels never enter the phase chain; they don't gate
      // `spin:allStarted` or the stop-sequence start.
      if (this._heldReels.has(i)) continue;
      const phase = this._activePhases.get(i);
      if (!phase || phase.name !== 'spin') { allSpinning = false; break; }
    }
    if (allSpinning) {
      this._events.emit('spin:allStarted');
      this._tryBeginStopSequence();
    }

    await spinDone;
    if (generation !== this._spinGeneration) return;

    // MultiWays: AdjustPhase commits the new shape and migrates pins between
    // SpinPhase and StopPhase. Inserted only when builder.multiways() was
    // called — non-MultiWays slots skip this entirely.
    if (this._hooks.isMultiWaysSlot && this._phaseFactory.has('adjust')) {
      await this._runAdjustForReel(reel, reelIndex, speed, generation);
      if (generation !== this._spinGeneration) return;
    }

    // SpinPhase resolved (result arrived). Run ANTICIPATION (if requested) then STOP.
    const stopDelay = this._stopDelayFor(reelIndex, speed);
    const targetFrame = this._frameFor(reelIndex);

    if (this._anticipationReels.includes(reelIndex) && speed.anticipationDelay > 0) {
      this._events.emit('spin:stopping', reelIndex);
      const anticipationPhase = this._phaseFactory.create<any>('anticipation', reel, speed);
      this._activePhases.set(reelIndex, anticipationPhase);
      await anticipationPhase.run({} as AnticipationPhaseConfig);
      if (generation !== this._spinGeneration) return;
    } else {
      this._events.emit('spin:stopping', reelIndex);
    }

    if (isTumble) {
      // Tumble stop = place + dropIn. Both phases are user-overridable via
      // the factory; the orchestration here is internal.
      const placePhase = this._phaseFactory.create<any>('cascade:place', reel, speed);
      this._activePhases.set(reelIndex, placePhase);
      await placePhase.run({
        targetFrame,
        winnerRows: [],
        initial: true,
        delay: stopDelay,
        events: this._events,
      } satisfies CascadePlacePhaseConfig);
      if (generation !== this._spinGeneration) return;

      const dropInPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
      this._activePhases.set(reelIndex, dropInPhase);
      await dropInPhase.run({
        winnerRows: [],
        initial: true,
        events: this._events,
      } satisfies CascadeDropInPhaseConfig);
      if (generation !== this._spinGeneration) return;
    } else {
      const stopPhase = this._phaseFactory.create<any>('stop', reel, speed);
      this._activePhases.set(reelIndex, stopPhase);
      await stopPhase.run({ targetFrame, delay: stopDelay } satisfies StopPhaseConfig);
      if (generation !== this._spinGeneration) return;
    }

    this._markLanded(reelIndex);
  }

  /**
   * MultiWays AdjustPhase orchestration: pull the pending shape, migrate
   * pins to their new rows, build pin-overlay tween descriptors, run the
   * phase. Emits `adjust:start` on entry and `adjust:complete` on exit.
   *
   * **Skips entirely** when there's no shape change AND no pin overlay on
   * this reel — no phase instance is constructed and no `adjust:*` events
   * fire. A spin where most reels have no work shouldn't pay for a phase
   * boundary or spam the event bus.
   */
  private async _runAdjustForReel(
    reel: Reel,
    reelIndex: number,
    speed: SpeedProfile,
    generation: number,
  ): Promise<void> {
    const targetShape = this._hooks.peekTargetShape();
    const targetRows = targetShape ? targetShape[reelIndex] : reel.visibleRows;
    const targetCellH = this._targetCellHeightFor(reel, targetRows);

    // Build tween descriptors BEFORE the reshape commits — they capture
    // each overlay's current on-screen pose as the tween's `from` state.
    const pinOverlays = this._hooks.buildPinOverlayTweens(
      reelIndex,
      targetCellH,
      this._hooks.symbolGapY,
    );

    // Commit the reshape via the shared helper (events + reel.reshape +
    // overlay refresh). Skip if no work and no overlays to tween.
    const reshapeHappened = this._applyReshape(reelIndex, targetRows);
    if (!reshapeHappened && pinOverlays.length === 0) {
      return;
    }

    // Run AdjustPhase purely as a tween phase — the geometry is already
    // committed. Phase only animates the pin overlays from their captured
    // pre-reshape pose to the new cell positions.
    if (pinOverlays.length === 0) {
      return;
    }
    const adjust = this._phaseFactory.create<any>('adjust', reel, speed);
    this._activePhases.set(reelIndex, adjust);
    await adjust.run({ pinOverlays } satisfies AdjustPhaseConfig);
  }

  private _stopDelayFor(reelIndex: number, speed: SpeedProfile): number {
    if (this._stopDelayOverride) {
      return this._stopDelayOverride[reelIndex] ?? 0;
    }
    return reelIndex * speed.stopDelay;
  }

  private _cachedFrames: string[][] | null = null;

  private _frameFor(reelIndex: number): string[] {
    if (!this._cachedFrames) return [];
    return this._cachedFrames[reelIndex];
  }

  private _tryBeginStopSequence(): void {
    if (!this._resultSymbols) return;

    for (let i = 0; i < this._reels.length; i++) {
      // Held reels never enter a phase chain — don't gate the stop
      // sequence on them.
      if (this._heldReels.has(i)) continue;
      const phase = this._activePhases.get(i);
      if (!phase || phase.name !== 'spin') return;
    }

    // For MultiWays, the per-reel target row count is whatever AdjustPhase
    // will reshape to. For frame-building purposes we need to send the
    // correct number of visible rows per reel. Pull the pending shape; if
    // unset, fall back to current reel.visibleRows.
    const pendingShape = this._hooks.peekTargetShape();
    const visibleRowsForReel = (i: number): number =>
      pendingShape ? pendingShape[i] : this._reels[i].visibleRows;

    // Big symbols: paint cross-reel OCCUPIED sentinels into the result grid
    // BEFORE per-reel frame building. The coordinator validates block fit
    // and rewrites cells; per-reel FrameBuilder then sees the sentinels and
    // RandomFillMiddleware skips them. Non-big-symbol slots are zero-cost.
    const decorated = this._coordinateBigSymbols(this._resultSymbols, visibleRowsForReel);

    // Build and cache frames using each reel's actual buffer/visible config.
    // Reels may differ in buffer size; build each independently. Held reels
    // get an empty placeholder — their entry is never read because no
    // StopPhase ever fires for them.
    const frames: string[][] = [];
    for (let i = 0; i < this._reels.length; i++) {
      if (this._heldReels.has(i)) {
        frames.push([]);
        continue;
      }
      const reel = this._reels[i];
      const rows = visibleRowsForReel(i);
      frames.push(
        this._frameBuilder.build(
          i,
          rows,
          reel.bufferAbove,
          reel.bufferBelow,
          decorated[i],
        ),
      );
    }
    this._cachedFrames = frames;

    // Resolve all non-held SpinPhases; each reel's _startReel awaits its own
    // spinDone, then independently runs ANTICIPATION/STOP. Held reels have
    // no SpinPhase to resolve.
    for (let i = 0; i < this._reels.length; i++) {
      if (this._heldReels.has(i)) continue;
      const spinPhase = this._activePhases.get(i) as SpinPhase;
      if (spinPhase?.resolve) spinPhase.resolve();
    }
  }

  /**
   * Big symbols cross-reel coordinator. Walks the result grid, locates big
   * symbols (those with `SymbolData.size.w * size.h > 1`), validates that
   * the block fits within reel bounds, and paints OCCUPIED sentinels into
   * the non-anchor cells so per-reel FrameBuilder leaves them alone.
   *
   * Pure: returns a new grid; does not mutate the input. Zero-overhead for
   * slots with no big symbols (the loop runs but never matches metadata).
   *
   * The clone preserves negative-index string properties (`arr[-1]`, ...)
   * that carry buffer-above targets in the legacy form, so downstream
   * consumers (FrameBuilder, placeSymbols) still see them on `decorated[col]`.
   */
  private _coordinateBigSymbols(
    grid: string[][],
    visibleRowsForReel: (i: number) => number,
  ): string[][] {
    const bufAbove = this._reels[0]?.bufferAbove ?? 0;
    const out: string[][] = grid.map((col) => {
      const colOut = [...col];
      for (let i = 1; i <= bufAbove; i++) {
        const v = (col as Record<number, string | undefined>)[-i];
        if (v !== undefined) (colOut as Record<number, string>)[-i] = v;
      }
      return colOut;
    });
    const symData = this._hooks.symbolsData;

    for (let col = 0; col < out.length; col++) {
      const rows = visibleRowsForReel(col);
      for (let row = 0; row < rows && row < out[col].length; row++) {
        const id = out[col][row];
        const meta = symData[id];
        if (!meta?.size) continue;
        const w = meta.size.w;
        const h = meta.size.h;
        if (w === 1 && h === 1) continue;

        // Validate block fit on this reel and across columns to the right.
        if (row + h > rows) {
          throw new Error(
            `big symbol '${id}' (${w}x${h}) at (col=${col}, row=${row}) ` +
            `exceeds reel ${col} height ${rows}.`,
          );
        }
        if (col + w > out.length) {
          throw new Error(
            `big symbol '${id}' (${w}x${h}) at (col=${col}, row=${row}) ` +
            `exceeds reel count ${out.length}.`,
          );
        }
        for (let dx = 0; dx < w; dx++) {
          const targetReel = col + dx;
          const targetRows = visibleRowsForReel(targetReel);
          if (row + h > targetRows) {
            throw new Error(
              `big symbol '${id}' (${w}x${h}) at (col=${col}, row=${row}) ` +
              `exceeds reel ${targetReel} height ${targetRows}.`,
            );
          }
        }

        // Paint OCCUPIED across the block (skip the anchor itself at dx=0,dy=0).
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            if (dx === 0 && dy === 0) continue;
            out[col + dx][row + dy] = OCCUPIED_SENTINEL;
          }
        }
      }
    }
    return out;
  }

  private _markLanded(reelIndex: number): void {
    if (this._landedReels.has(reelIndex)) return;
    this._landedReels.add(reelIndex);

    const reel = this._reels[reelIndex];
    const symbols = reel.getVisibleSymbols();
    reel.events.emit('landed', symbols);
    this._events.emit('spin:reelLanded', reelIndex, symbols);

    // All NON-HELD reels accounted for → finish. Held reels never
    // _markLanded, but their slots count toward `reels.length`, so we
    // compare against the count that was supposed to actually animate.
    if (this._landedReels.size === this._reels.length - this._heldReels.size) {
      this._finishSpin();
    }
  }

  private _finishSpin(): void {
    const result: SpinResult = {
      symbols: this._reels.map((r) => r.getVisibleSymbols()),
      wasSkipped: this._wasSkipped,
      duration: performance.now() - this._spinStartTime,
    };

    this._isSpinning = false;
    this._activePhases.clear();
    this._cachedFrames = null;
    // MultiWays: the target shape was applied this spin; clear it so the next
    // spin starts fresh. Non-MultiWays: this is a no-op.
    this._hooks.clearTargetShape();

    this._events.emit('spin:allLanded', result);
    this._events.emit('spin:complete', result);

    if (this._currentSpinResolve) {
      this._currentSpinResolve(result);
      this._currentSpinResolve = null;
    }
  }

  private _onTick(ticker: Ticker): void {
    if (!this._isSpinning) return;

    const deltaMs = ticker.deltaMS;
    for (const reel of this._reels) {
      reel.update(deltaMs);
    }
    for (const phase of this._activePhases.values()) {
      if (phase.isActive) {
        phase.update(deltaMs);
      }
    }
  }
}
