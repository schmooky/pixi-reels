import type { Ticker } from 'pixi.js';
import type { Reel } from '../core/Reel.js';
import type {
  AnticipationOptions,
  AnticipationProtect,
  AnticipationSlowdown,
  AnticipationStagger,
  SlamOptions,
  SpeedProfile,
  SpinOptions,
  SymbolData,
} from '../config/types.js';
import type { SpeedManager } from '../speed/SpeedManager.js';
import type { FrameBuilder } from '../frame/FrameBuilder.js';
import type { SpinResult } from '../events/ReelEvents.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSetEvents } from '../events/ReelEvents.js';
import { PhaseFactory } from './phases/PhaseFactory.js';
import type { SpinPhase, SpinPhaseConfig } from './phases/SpinPhase.js';
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
import {
  cloneColumnTarget,
  getTargetSlot,
  setTargetSlot,
  type ColumnTarget,
} from '../frame/ColumnTarget.js';
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
  multiwaysReelExtent: number;
  /** Reel-scoped pin lookup. Used to build AdjustPhase tween descriptors. */
  getPinsOnReel(reelIndex: number): CellPin[];
  /**
   * Migrate pins on a reel to a new visible-cell count, returning the
   * resulting moves. Mutates the pin map directly inside ReelSet.
   */
  migratePinsForReel(reelIndex: number, newCells: number): {
    pin: CellPin;
    fromCell: number;
    toCell: number;
    clamped: boolean;
  }[];
  /**
   * Reposition + resize every pin overlay on the given reel. Called after
   * AdjustPhase commits a MultiWays reshape so overlays move to their new
   * (post-migration) cell at the new cell size.
   */
  refreshPinOverlaysForReel(reelIndex: number): void;
  /**
   * Build AdjustPhase pin-overlay tween descriptors for a reel. one per
   * active pin overlay. Captures pre-reshape (current) Y/size from the
   * overlay and computes post-reshape target. Called BEFORE the reshape
   * commits so the "from" state reflects what's actually on screen.
   */
  buildPinOverlayTweens(
    reelIndex: number,
    targetCellMain: number,
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
 * It does not draw anything. drawing lives on `Reel` and `ReelSymbol`.
 * It does not decide outcomes. that's `setResult(grid)` coming in from
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
  private _resultSymbols: ColumnTarget[] | null = null;
  private _anticipationReels: number[] = [];
  /**
   * How the START of each anticipation reel's slow-down is spaced. See
   * {@link setAnticipation}. `0` (or a single tease reel) reproduces the
   * legacy behaviour where every anticipation reel begins slowing at once.
   */
  private _anticipationStagger: AnticipationStagger = 0;
  /**
   * Progressive slow-down curve applied across the tease sequence, or `null`
   * for the flat default (every anticipation reel drops to the phase default
   * of 30% spin speed). See {@link setAnticipation}. Cleared per spin.
   */
  private _anticipationSlowdown: AnticipationSlowdown | null = null;
  /**
   * Explicit anticipation hold (ms) that OVERRIDES the active speed profile's
   * `anticipationDelay`. Set via `setAnticipation(reels, { duration })`. `null`
   * means "use the profile". A positive value also lets the tease play when the
   * profile's `anticipationDelay` is `0` (Turbo / SuperTurbo). Cleared per spin.
   */
  private _anticipationDuration: number | null = null;
  /**
   * Tease-protect mode for this spin, or `null` for none. Set via
   * `setAnticipation(reels, { protect })`; see {@link AnticipationProtect}.
   * Decides whether a `skip()` / `requestSkip()` press is allowed to end a
   * tease or only lands the reels around it. Cleared per spin.
   */
  private _anticipationProtect: AnticipationProtect = false;
  /**
   * `true` once a protected press has spent `'once'` protection, so the next
   * press slams everything. Never set under `'always'` (which is unspendable).
   * Cleared per spin.
   */
  private _protectSpent = false;
  /**
   * Reels that actually entered a tease this spin. populated when
   * `anticipation:reel` fires, drained in `_markLanded` to fire
   * `anticipation:reelEnd` only for reels that teased. Cleared per spin.
   */
  private _teasingReels = new Set<number>();
  /**
   * `'sequential'` anticipation chaining state: one deferred per anticipation
   * reel, resolved when that reel lands (in `_markLanded`). Reel at tease-order
   * `k` awaits the deferred of the reel at order `k-1` before starting its
   * tease. Rebuilt each `setAnticipation('sequential')`; cleared per spin.
   */
  private _reelLandedResolvers: Map<number, () => void> = new Map();
  private _reelLandedPromises: Map<number, Promise<void>> = new Map();
  private _stopDelayOverride: number[] | null = null;
  private _activePhases: Map<number, ReelPhase<any>> = new Map();
  private _landedReels = new Set<number>();
  /**
   * Reels landed by a PARTIAL slam. A full slam aborts every in-flight phase
   * chain by bumping `_spinGeneration`, but a partial one must leave the
   * surviving reels' chains running, so it can't touch the generation.
   * Instead the slammed indices land here and each per-reel chain checks them
   * at its own await boundaries via `_isStale`. Cleared per spin / refill and
   * whenever a full slam takes over.
   */
  private _slammedReels = new Set<number>();
  /**
   * Minimum spin time (ms) override, replacing the active speed profile's
   * `minimumSpinTime` floor. A single number applies to every reel; an array
   * is per-reel (index-aligned, short arrays fall back to the profile).
   * `null` = no override. Like `_stopDelayOverride`, this PERSISTS across
   * `spin()` / `refill()` until explicitly cleared.
   */
  private _minimumSpinTimeOverride: number | number[] | null = null;
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
  private _currentSpinReject: ((error: Error) => void) | null = null;
  /**
   * Set by `_abortSpin()` so the shared settle point `_finishSpin()` rejects
   * the spin promise (and skips the success events) instead of resolving.
   */
  private _pendingAbortError: Error | null = null;
  /** Removes the active spin's abort listener and clears its watchdog timer. */
  private _spinWatchdogCleanup: (() => void) | null = null;
  /** Incremented on each new spin. If a callback sees a stale generation, it no-ops. */
  private _spinGeneration = 0;
  /**
   * Round-aware `skip()` state. Lives across `refill()` calls within a
   * round (one `spin()` + its cascade refills) and resets on the next
   * `spin()`.
   *
   * `0`. no press yet this round.
   * `1`. a press landed the reels AROUND a protected tease and left the
   *       tease running (see {@link AnticipationProtect}). The round's side
   *       effect has NOT been applied yet. reached only on a spin that called
   *       `setAnticipation(..., { protect })`.
   * `2`. a press has slammed (and applied the round's side effect: a
   *       speed boost in standard mode or auto-slam-refills in cascade).
   *       Subsequent presses also slam.
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
   * and the next `spin()`. i.e. the user made an explicit speed choice
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
      multiwaysReelExtent: 0,
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

    // Already-aborted signal: never even start the reels.
    if (options?.signal?.aborted) {
      return Promise.reject(this._abortError(options.signal));
    }

    const mode = options?.mode ?? this._defaultSpinMode;
    if (mode === 'cascade' && !this._phaseFactory.has('cascade:fall')) {
      throw new Error(
        "spin({ mode: 'cascade' }) requires .tumble(...) on the builder.",
      );
    }
    if (mode === 'standard' && this._reels.some((r) => r.bufferEnd === 0)) {
      throw new Error(
        "spin({ mode: 'standard' }) requires bufferEnd >= 1: strip scrolling " +
          'wraps symbols through the below-window buffer. This reel set was ' +
          'built with bufferSymbols({ end: 0 }) for tumble-only use.',
      );
    }
    this._currentSpinMode = mode;

    // Round boundary: a new `spin()` ends the previous round. If the
    // player boosted via `skip()` last round AND did NOT manually call
    // `setSpeed()` between rounds, restore the pre-boost speed. The
    // manual-flag check is what distinguishes "user untouched, restore"
    // from "user explicitly chose the boosted name, leave alone". the
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
    this._pendingAbortError = null;
    this._spinStartTime = performance.now();
    this._resultSymbols = null;
    this._anticipationReels = [];
    this._anticipationStagger = 0;
    this._anticipationSlowdown = null;
    this._anticipationDuration = null;
    this._anticipationProtect = false;
    this._protectSpent = false;
    this._teasingReels.clear();
    this._reelLandedResolvers.clear();
    this._reelLandedPromises.clear();
    // NOTE: _stopDelayOverride is NOT cleared here. The contract is that
    // `setDropOrder()` (or `setStopDelays()`) is called right before
    // `spin()` / `refill()` and represents user intent for the upcoming
    // sequence. Clearing it on entry would silently drop the value the
    // user just set. The override persists until the next setDropOrder()
    // call overwrites it.
    this._landedReels.clear();
    this._slammedReels.clear();
    this._activePhases.clear();
    this._heldReels = this._normalizeHoldReels(options?.holdReels);
    this._spinGeneration++;

    const generation = this._spinGeneration;
    const speed = this._speedManager.active;

    this._events.emit('spin:start');

    const resultPromise = new Promise<SpinResult>((resolve, reject) => {
      this._currentSpinResolve = resolve;
      this._currentSpinReject = reject;
    });
    this._armSpinWatchdog(options, generation);

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
        `[pixi-reels] reel ${reelIndex} (${kind}) phase chain threw. slamming to recover:`,
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

  setResult(symbols: ColumnTarget[]): void {
    if (!this._isSpinning) return;
    // Fail-fast: validate big-symbol block fit so setResult throws at the
    // call site rather than later inside skip()/_tryBeginStopSequence().
    const visibleCellsForReel = (i: number): number => {
      const pendingShape = this._hooks.peekTargetShape();
      return pendingShape ? pendingShape[i] : this._reels[i].visibleCells;
    };
    this._coordinateBigSymbols(symbols, visibleCellsForReel);
    this._resultSymbols = symbols;
    this._tryBeginStopSequence();
    if (this._skipPending) {
      // Deferred `requestSkip()` is an explicit slam intent. bypass the
      // two-stage `skip()` machine and slam directly. Tease protection still
      // applies: a press queued before the result arrived is exactly the case
      // the feature exists for, since the tease hasn't started yet. Requires
      // `setAnticipation()` to have been called by now. call it BEFORE
      // `setResult()` (every recipe does) or the queued press sees no tease
      // to protect.
      this._skipPending = false;
      this._pressSkip(false);
    }
  }

  /**
   * Tumble cascade: place + drop-in for a refill (Moment B). Skips the
   * fall and the wait-for-result. the caller already cleared the winning
   * cells in user code and is now handing us the next grid directly.
   *
   * Two refill modes:
   *
   *   - `'combined'` (default). survivors and new symbols animate together
   *     in one drop-in phase. The classic Sweet Bonanza / Sugar Rush feel.
   *   - `'gravity-then-drop'`. survivors slide down to fill holes FIRST
   *     (gravity stage), then a global hold, then new symbols drop in from
   *     above (drop-in stage). The Mummyland Treasures / Reactoonz feel.
   *     gives space for anticipation visuals between the two beats. Per-reel
   *     stop delays (`setDropOrder`) apply to the drop-in stage only; the
   *     gravity stage runs simultaneously across all reels.
   *
   * The hold between gravity and drop-in is the **max** of three sources
   * (Promise.all semantics. whichever finishes LAST gates the drop-in):
   *
   *   - `gravityHoldMs` (default `250`). fixed wall-clock pause via setTimeout.
   *   - `gravityHold: Promise<void>`. caller-supplied promise. Use when you
   *     already have an in-flight animation/SFX/etc. and want to wait for it
   *     by handle rather than wrapping in a callback.
   *   - `onGravityComplete: () => Promise<void> | void`. callback invoked
   *     at the gravity-end boundary; its returned promise is awaited.
   *
   * `gravityHoldMs` and `gravityHold` race in parallel (Promise.all of the
   * two. both must finish before drop-in starts). `onGravityComplete` runs
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
     * factory function. `() => Promise<void>`. to defer creation until
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

    // The cascade grid describes the visible window; buffer entries, if any,
    // ride along untouched. Check the visible run per column.
    const normalizedGrid = opts.grid;
    if (normalizedGrid.length !== this._reels.length) {
      throw new RangeError(
        `refill: grid has ${normalizedGrid.length} column(s) but the reel set has ` +
        `${this._reels.length}.`,
      );
    }
    for (let i = 0; i < normalizedGrid.length; i++) {
      const expected = this._reels[i].visibleCells;
      if (normalizedGrid[i].visible.length !== expected) {
        throw new RangeError(
          `refill: grid column ${i} has ${normalizedGrid[i].visible.length} cell(s) but ` +
          `reel ${i} has ${expected} visible cell(s).`,
        );
      }
    }
    for (const w of opts.winners) {
      if (!Number.isInteger(w.reel) || w.reel < 0 || w.reel >= this._reels.length) {
        throw new RangeError(
          `refill: winner.reel ${w.reel} out of range [0, ${this._reels.length}).`,
        );
      }
      const cells = this._reels[w.reel].visibleCells;
      if (!Number.isInteger(w.cell) || w.cell < 0 || w.cell >= cells) {
        throw new RangeError(
          `refill: winner.cell ${w.cell} out of range [0, ${cells}) for reel ${w.reel}.`,
        );
      }
    }

    this._isSpinning = true;
    this._wasSkipped = false;
    this._skipPending = false;
    this._pendingAbortError = null;
    this._spinStartTime = performance.now();
    this._resultSymbols = null;
    this._anticipationReels = [];
    this._anticipationStagger = 0;
    this._anticipationSlowdown = null;
    this._anticipationDuration = null;
    this._anticipationProtect = false;
    this._protectSpent = false;
    this._teasingReels.clear();
    this._reelLandedResolvers.clear();
    this._reelLandedPromises.clear();
    // _stopDelayOverride preserved across entry. see spin() for rationale.
    // Cascade recipes set `setDropOrder('all')` right before refill() and
    // would otherwise see their setting clobbered, falling back to the
    // default `i * speed.stopDelay` left-to-right stagger.
    this._landedReels.clear();
    this._slammedReels.clear();
    this._activePhases.clear();
    this._heldReels = new Set();
    this._spinGeneration++;
    this._currentSpinMode = 'cascade';

    const generation = this._spinGeneration;
    const speed = this._speedManager.active;

    // Normalize grid + build per-reel frames upfront. No waiting on
    // `setResult` here. the caller provided everything. Reuses the
    // already-validated `normalizedGrid` from the entry guards.
    this._resultSymbols = normalizedGrid;
    const decorated = this._coordinateBigSymbols(normalizedGrid, (i) => this._reels[i].visibleCells);
    const frames: string[][] = [];
    for (let i = 0; i < this._reels.length; i++) {
      const reel = this._reels[i];
      frames.push(
        this._frameBuilder.build(i, reel.visibleCells, reel.bufferStart, reel.bufferEnd, decorated[i]),
      );
    }
    this._cachedFrames = frames;

    // Group winners per reel and sort ascending. the gravity algorithm
    // expects ascending winner cells when it builds nonWinnerCells.
    const winnersByReel = new Map<number, number[]>();
    for (const w of opts.winners) {
      let arr = winnersByReel.get(w.reel);
      if (!arr) {
        arr = [];
        winnersByReel.set(w.reel, arr);
      }
      arr.push(w.cell);
    }
    for (const arr of winnersByReel.values()) arr.sort((a, b) => a - b);

    this._events.emit('spin:start');

    const resultPromise = new Promise<SpinResult>((resolve) => {
      this._currentSpinResolve = resolve;
      // Refills are driven from an already-known grid, so they carry no
      // external watchdog. Drop any stale reject handle from the spin() that
      // opened this round.
      this._currentSpinReject = null;
    });

    // Auto-slam: skip() set this earlier in the round to mean "fast-forward
    // the rest of this cascade." Bypass the place + dropIn phase chain and
    // land instantly. `_slam()` sees no active phases, `_resultSymbols` is
    // set, and per-reel placement happens synchronously.
    if (this._autoSlamRefills) {
      this._slam();
      this._skipStage = 2;
      return resultPromise;
    }

    const mode = opts.mode ?? 'combined';

    if (mode === 'gravity-then-drop') {
      // Two-stage orchestration. All reels do place + gravity in parallel
      // (no per-reel stop delay. gravity is a global "settling" beat,
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
        //. without this the refill promise would hang forever.
        this._events.emit('cascade:gravity:error', { error: err });
        // eslint-disable-next-line no-console
        console.error(
          '[pixi-reels] two-stage refill threw (likely from a user-supplied ' +
          'gravityHold/onGravityComplete). slamming to recover:',
          err,
        );
        this._slam();
      });
    } else {
      for (let i = 0; i < this._reels.length; i++) {
        const winnerCells = winnersByReel.get(i) ?? [];
        this._runReelTask(this._refillReel(i, speed, generation, winnerCells), 'refill', i, generation);
      }
    }

    return resultPromise;
  }

  private async _refillReel(
    reelIndex: number,
    speed: SpeedProfile,
    generation: number,
    winnerCells: number[],
  ): Promise<void> {
    if (this._isStale(reelIndex, generation)) return;

    const reel = this._reels[reelIndex];
    const targetFrame = this._frameFor(reelIndex);
    const stopDelay = this._stopDelayFor(reelIndex, speed);

    const placePhase = this._phaseFactory.create<any>('cascade:place', reel, speed);
    this._activePhases.set(reelIndex, placePhase);
    await placePhase.run({
      targetFrame,
      winnerCells,
      initial: false,
      delay: stopDelay,
      events: this._events,
    } satisfies CascadePlacePhaseConfig);
    if (this._isStale(reelIndex, generation)) return;

    const dropInPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
    this._activePhases.set(reelIndex, dropInPhase);
    await dropInPhase.run({
      winnerCells,
      initial: false,
      events: this._events,
    } satisfies CascadeDropInPhaseConfig);
    if (this._isStale(reelIndex, generation)) return;

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
    // Stage 1. place + gravity. Place phase runs with delay = 0 so all
    // reels swap identities in lockstep; the staggered "reveal" lives in
    // stage 2.
    const stage1 = this._reels.map(async (_, i) => {
      if (this._isStale(i, generation)) return;
      const reel = this._reels[i];
      const targetFrame = this._frameFor(i);
      const winnerCells = winnersByReel.get(i) ?? [];

      const placePhase = this._phaseFactory.create<any>('cascade:place', reel, speed);
      this._activePhases.set(i, placePhase);
      await placePhase.run({
        targetFrame,
        winnerCells,
        initial: false,
        delay: 0,
        events: this._events,
      } satisfies CascadePlacePhaseConfig);
      if (this._isStale(i, generation)) return;

      const gravityPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
      this._activePhases.set(i, gravityPhase);
      await gravityPhase.run({
        winnerCells,
        initial: false,
        role: 'gravity',
        events: this._events,
      } satisfies CascadeDropInPhaseConfig);
    });
    await Promise.all(stage1);
    if (generation !== this._spinGeneration) return;

    // Global hold. the beat where the player reads "the wins are gone, the
    // surviving symbols have settled" and any user-code anticipation
    // visuals (multiplier bump, mascot react) play. Two sources race in
    // PARALLEL via Promise.all: a fixed `gravityHoldMs` setTimeout and a
    // caller-supplied `gravityHold` promise. Whichever finishes last gates
    // the drop-in. pass both when you want a min-wall-clock floor under
    // an animation that might be fast. Skip during this window bumps the
    // generation; the post-await guard bails before the drop-in stage.
    //
    // `gravityHold` accepts a factory (`() => Promise<void>`) so that its
    // side effects (e.g. starting a multiplier-roll animation) fire HERE,
    // at gravity-end. not back when the refill args were assembled. A
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

    // Awaitable callback. runs AFTER the parallel hold sources resolve,
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

    // Stage 2. drop-in (new symbols only). Per-reel stop delays apply
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
    winnerCells: number[],
  ): Promise<void> {
    if (this._isStale(reelIndex, generation)) return;

    const reel = this._reels[reelIndex];
    const stopDelay = this._stopDelayFor(reelIndex, speed);

    // setDropOrder produces per-reel start delays; honour them here as a
    // sleep before kicking off the drop-in phase. Sleeping outside the
    // phase keeps the phase API simple. it doesn't need its own delay
    // parameter (Phase delay is a CascadePlacePhase concern).
    if (stopDelay > 0) {
      await new Promise<void>((r) => setTimeout(r, stopDelay));
      if (this._isStale(reelIndex, generation)) return;
    }

    const dropInPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
    this._activePhases.set(reelIndex, dropInPhase);
    await dropInPhase.run({
      winnerCells,
      initial: false,
      role: 'new',
      events: this._events,
    } satisfies CascadeDropInPhaseConfig);
    if (this._isStale(reelIndex, generation)) return;

    this._markLanded(reelIndex);
  }

  /**
   * Mark reels to tease, and shape how they slow down.
   *
   * The second argument is either a bare `stagger` value or a full
   * `{ stagger, slowdown }` options object.
   *
   * `stagger` controls when each anticipation reel BEGINS slowing (offsets
   * are by tease-order. position within `reelIndices`. not raw reel index):
   *   - `0` (default): all teases start together (legacy parallel behaviour).
   *   - `number`: reel at tease-order `k` starts after `k * stagger` ms.
   *   - `number[]`: explicit per-tease-order offset in ms (`stagger[k]`).
   *   - `'sequential'`: each reel waits until the previous anticipation reel
   *     has fully landed before it starts. maximal one-at-a-time tension.
   *
   * `slowdown` makes the deceleration progressive across the sequence: each
   * successive reel slows to a lower speed (`from` → `to`) and/or holds longer
   * (`holdFrom` → `holdTo`). Omit it for the flat 30%-and-hold default.
   *
   * `duration` overrides the active speed profile's `anticipationDelay` (ms).
   * Pass a positive value to make the tease play even in Turbo / SuperTurbo,
   * whose profiles have `anticipationDelay: 0` and would otherwise skip it.
   *
   * `protect` decides what a skip press does to the tease. By default a press
   * lands everything and the player never learns the spin was teasing;
   * `'once'` lands the reels around the tease and leaves the tease itself
   * running, so the trigger is on screen before a second press can end it.
   * See {@link AnticipationProtect}.
   */
  setAnticipation(
    reelIndices: number[],
    options: AnticipationStagger | AnticipationOptions = 0,
  ): void {
    const opts: AnticipationOptions =
      typeof options === 'object' && !Array.isArray(options)
        ? options
        : { stagger: options };
    const stagger = opts.stagger ?? 0;

    // Held reels never reach AnticipationPhase, but filter here too so the
    // public API is forgiving. callers can pass a flat list without
    // tracking which indices are held this spin.
    this._anticipationReels = reelIndices.filter((i) => !this._heldReels.has(i));
    this._anticipationStagger = stagger;
    this._anticipationSlowdown = opts.slowdown ?? null;
    this._anticipationDuration = opts.duration ?? null;
    this._anticipationProtect = opts.protect ?? false;
    this._protectSpent = false;
    this._teasingReels.clear();

    // Sequential chaining needs a landed-deferred per anticipation reel so a
    // reel can await the previous one's landing. Build them here (setResult
    // resolves the spin phases synchronously, so the deferreds must exist
    // before the anticipation branch runs on the next microtask).
    this._reelLandedResolvers.clear();
    this._reelLandedPromises.clear();
    if (stagger === 'sequential') {
      for (const i of this._anticipationReels) {
        this._reelLandedPromises.set(
          i,
          new Promise<void>((resolve) => this._reelLandedResolvers.set(i, resolve)),
        );
      }
    }
  }

  /**
   * Override the per-reel stop delay (in ms). Pass one value per reel.
   * When set, these replace the staggered `reelIndex * speed.stopDelay`
   * pattern. Pass `null` to CLEAR the override and restore that default
   * (distinct from passing all-zeros, which lands every reel at once).
   */
  setStopDelays(delays: number[] | null): void {
    this._stopDelayOverride = delays ? [...delays] : null;
  }

  /**
   * Override the minimum spin time (ms) that every reel must accumulate in
   * `SpinPhase` before it is allowed to move on to anticipation / stop.
   * Replaces the active speed profile's `minimumSpinTime`, which is a single
   * value shared by every reel and therefore the floor no individual reel can
   * land below.
   *
   * Pass a number for a uniform floor, or one value per reel for a per-reel
   * floor (entries past the end of the array fall back to the profile). Pass
   * `null` to clear and restore the profile value.
   *
   * Like `setStopDelays()`, the override PERSISTS across `spin()` and
   * `refill()` until it is explicitly cleared.
   */
  setMinimumSpinTime(ms: number | number[] | null): void {
    this._minimumSpinTimeOverride = Array.isArray(ms) ? [...ms] : ms;
  }

  /** Resolve the effective `SpinPhase` floor for one reel. */
  private _minimumSpinTimeFor(reelIndex: number): number | undefined {
    const override = this._minimumSpinTimeOverride;
    if (override === null) return undefined;
    const value = Array.isArray(override) ? override[reelIndex] : override;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return value;
  }

  /**
   * Slam-stop safe before `setResult()` arrives. Queues until a result is
   * set, then slams. Bypasses the two-stage `skip()` machine. this API is
   * for callers with explicit slam intent (e.g. UIs that wire the queued
   * slam separately from a stage-aware button).
   */
  requestSkip(): void {
    if (!this._isSpinning) return;
    if (this._resultSymbols) {
      this._pressSkip(false);
      return;
    }
    this._skipPending = true;
  }

  /**
   * Round-aware skip. the button-press entry point used by the universal
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
   *. slamming now would land the reels on the random spin-buffer state).
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
        'skip() called before setResult(). there is nothing to land on yet ' +
        '(standard mode would land on random buffer fill; cascade mode would land ' +
        "invisible). Use reelSet.requestSkip() to queue the slam until setResult() " +
        'arrives, or wait for setResult() before calling skip().',
      );
    }

    this._pressSkip(true);
  }

  /**
   * Shared body of the two player-facing skip presses (`skip()` and the
   * post-result / deferred half of `requestSkip()`).
   *
   * Consults tease protection first. When a protected tease is still in
   * flight, this press lands only the reels AROUND it, holds the round's
   * side effect back (there's another press coming), and parks at
   * `skipStage: 1`. Otherwise it applies the side effect (first effective
   * press of the round only) and slams everything.
   *
   * @param withSideEffects - `false` for `requestSkip()`, which is documented
   *   as a bare slam intent and never boosts speed or arms cascade auto-slam.
   */
  private _pressSkip(withSideEffects: boolean): void {
    const group = this._nextSlamGroup();
    if (group !== null) {
      this._slam(group);
      // Read this BEFORE spending `'once'`, and off the raw anticipation set
      // rather than `_protectedTeaseReels()`. that helper reports what is
      // still PROTECTED, which spending would zero out, and "the tease is
      // over" is not the same question as "the tease is still protected".
      const teaseLeft = this._teaseStillRunning();
      // `'once'` is the only spendable mode. `'stepwise'` and `'always'` keep
      // protecting whatever tease is left.
      if (this._anticipationProtect === 'once') this._protectSpent = true;

      if (teaseLeft) {
        // Tease still running. Stage 1, not 2: the round's side effect is
        // still owed to the press that actually ends it.
        if (this._skipStage === 0) this._skipStage = 1;
        return;
      }
      // That release emptied the tease, so this WAS the round-ending press.
      // Fall through for the side effect and stage 2, but skip the second
      // `_slam()`. everything is already down and a bare `_slam()` would
      // emit a second, empty pair of skip events for one press.
      this._applyRoundSideEffects(withSideEffects);
      this._skipStage = 2;
      return;
    }

    this._applyRoundSideEffects(withSideEffects);
    this._slam();
    this._skipStage = 2;
  }

  /**
   * The reels the NEXT press should land, or `null` when no tease protection
   * is in force and the press is a plain full slam.
   *
   * Groups come out in the order a player walks through them:
   *
   *   1. everything outside the tease. the trigger symbols and any filler
   *      reel, landed together so the board reads at a glance,
   *   2. under `'stepwise'`, one tease reel per press after that, in tease
   *      order, so the tension steps forward instead of ending at once.
   *
   * `'once'` and `'always'` stop after group 1: `'once'` spends its
   * protection there and the next press is a plain full slam, `'always'`
   * returns an empty group forever (a no-op press, by design).
   */
  private _nextSlamGroup(): number[] | null {
    const teasing = this._protectedTeaseReels();
    if (teasing.size === 0) return null;

    const rest: number[] = [];
    for (let i = 0; i < this._reels.length; i++) {
      if (teasing.has(i) || this._landedReels.has(i) || this._heldReels.has(i)) continue;
      rest.push(i);
    }
    if (rest.length > 0) return rest;

    // Nothing left outside the tease. Only `'stepwise'` reaches into it.
    if (this._anticipationProtect !== 'stepwise') return rest;

    // Tease ORDER, not reel index: `setAnticipation([4, 2, 3])` releases 4
    // first, matching the order the teases were staged in.
    const next = this._anticipationReels.find((i) => teasing.has(i));
    return next === undefined ? rest : [next];
  }

  /** Is any anticipation reel still un-landed, protected or not? */
  private _teaseStillRunning(): boolean {
    for (const i of this._anticipationReels) {
      if (!this._landedReels.has(i) && !this._heldReels.has(i)) return true;
    }
    return false;
  }

  /**
   * The once-per-round side effect a skip press carries, applied by whichever
   * press ends the round. Split out of `_pressSkip` because a `'stepwise'`
   * release can end the round without going through the full-slam path.
   */
  private _applyRoundSideEffects(withSideEffects: boolean): void {
    if (withSideEffects && this._skipStage !== 2) {
      if (this._currentSpinMode === 'cascade') {
        // Cascade: phase durations are static (don't read `speed.spinSpeed`),
        // so a boost would be invisible. Auto-slam future refills instead.
        this._autoSlamRefills = true;
      } else {
        // Standard: try to boost speed for the rest of the round. If the
        // active profile is already the fastest (or only one is registered),
        // we just slam. no boost is observable.
        const fastest = this._findFastestSpeedName();
        if (fastest !== null && fastest !== this._speedManager.activeName) {
          const { previous, current } = this._speedManager.set(fastest);
          this._skipPreviousSpeedName = previous.name;
          this._skipBoostedToName = current.name;
          this._events.emit('skip:boosted', { previous, current });
        }
      }
    }
  }

  /**
   * The reels a skip press must NOT land right now, per the active
   * {@link AnticipationProtect} mode. Empty (no protection in force) when:
   *
   *   - no `protect` was passed to `setAnticipation`,
   *   - `'once'` protection was already spent by an earlier press
   *     (`'stepwise'` and `'always'` are not spendable),
   *   - the effective tease hold is `0` ms, so no tease would play anyway
   *     (Turbo / SuperTurbo without a `duration` override). Protecting a
   *     tease that never happens would stall the reels for nothing AND
   *     reintroduce the response-time tell it exists to remove,
   *   - every anticipation reel has already landed.
   */
  private _protectedTeaseReels(): Set<number> {
    const out = new Set<number>();
    if (this._anticipationProtect === false) return out;
    if (this._anticipationProtect === 'once' && this._protectSpent) return out;

    const speed = this._speedManager.active;
    const hold = this._anticipationDuration ?? speed.anticipationDelay;
    if (hold <= 0) return out;

    for (const i of this._anticipationReels) {
      if (this._landedReels.has(i)) continue;
      if (this._heldReels.has(i)) continue;
      out.add(i);
    }
    return out;
  }

  /**
   * Hard slam-stop. Lands un-landed reels immediately regardless of stage,
   * ignoring tease protection. Sets `skipStage` to 2 so future `skip()`
   * presses in this round also slam (the boost ship has sailed).
   *
   * Pass `{ reels }` or `{ except }` for a PARTIAL slam: those reels land now
   * and every other reel keeps running its phase chain to a natural landing.
   * This is the low-level lever under tease protection, exposed so a game can
   * build its own skip granularity (land the left reels, let the right ones
   * play). A partial slam leaves `skipStage` alone. it isn't the round-ending
   * press.
   */
  slamStop(options?: SlamOptions): void {
    if (!this._isSpinning) return;
    if (options?.reels && options?.except) {
      throw new Error("slamStop: pass either 'reels' or 'except', not both.");
    }
    if (options?.reels) {
      this._slam(options.reels);
      return;
    }
    if (options?.except) {
      const exclude = new Set(options.except);
      const targets: number[] = [];
      for (let i = 0; i < this._reels.length; i++) {
        if (!exclude.has(i)) targets.push(i);
      }
      this._slam(targets);
      return;
    }
    this._slam();
    this._skipStage = 2;
  }

  /**
   * Should this reel's phase chain abort at its current await boundary?
   *
   * Two independent abort switches:
   *   - the GLOBAL one. `_spinGeneration` moved, so a fresh `spin()` /
   *     `refill()` / full slam / destroy replaced this whole round,
   *   - the PER-REEL one. this reel was landed by a partial slam, which
   *     must not disturb the reels still running.
   */
  private _isStale(reelIndex: number, generation: number): boolean {
    return generation !== this._spinGeneration || this._slammedReels.has(reelIndex);
  }

  /**
   * The slam path itself: force-complete active phases, place results (or
   * snap to current symbols when no result is set), mark the target reels as
   * landed. Shared by `skip()` (stage 1+), `requestSkip()`'s deferred path,
   * `slamStop()`, and the per-reel error-recovery path inside `_runReelTask`.
   *
   * With no argument it lands every un-landed, non-held reel and ends the
   * round: active phases die, `_spinGeneration` moves, every chain aborts.
   *
   * With `reels` it lands only those and the round continues. The surviving
   * chains must keep running, so the generation is left alone and the slammed
   * indices are recorded in `_slammedReels` for `_isStale` to act on. This is
   * what makes skip granularity expressible: tease protection is a partial
   * slam over "everything except the anticipation reels".
   *
   * Idempotent: a second call once the spin has finished is a no-op. Lets
   * cascading rejection handlers each safely invoke `_slam` without
   * triple-emitting `skip:requested`.
   */
  private _slam(reels?: readonly number[]): void {
    if (!this._isSpinning) return;

    // Resolve the target set first: everything downstream (which phases die,
    // whether the generation moves, which reels get placed) keys off it.
    const targets = new Set<number>();
    if (reels) {
      for (const i of reels) {
        if (!Number.isInteger(i) || i < 0 || i >= this._reels.length) continue;
        if (this._landedReels.has(i) || this._heldReels.has(i)) continue;
        targets.add(i);
      }
      // A partial slam with nothing left to land is a no-op, not a skip: it
      // must not flip `wasSkipped` or fire the skip events. (The full path
      // keeps its historical behaviour of emitting even when every reel has
      // already landed.)
      if (targets.size === 0) return;
    } else {
      for (let i = 0; i < this._reels.length; i++) {
        if (this._landedReels.has(i) || this._heldReels.has(i)) continue;
        targets.add(i);
      }
    }

    let unlanded = 0;
    for (let i = 0; i < this._reels.length; i++) {
      if (!this._landedReels.has(i) && !this._heldReels.has(i)) unlanded++;
    }
    const partial = targets.size < unlanded;

    this._wasSkipped = true;
    this._events.emit('skip:requested', { reels: [...targets], partial });

    if (partial) {
      // Kill ONLY the target reels' phases and abort ONLY their chains. The
      // generation is the global abort switch; bumping it here would strand
      // every surviving reel mid-chain, so partial slams route their abort
      // through `_slammedReels` instead (see `_isStale`).
      for (const i of targets) {
        const phase = this._activePhases.get(i);
        if (phase) {
          phase.forceComplete();
          this._activePhases.delete(i);
        }
        this._slammedReels.add(i);
      }
    } else {
      for (const [, phase] of this._activePhases) {
        phase.forceComplete();
      }
      this._activePhases.clear();
      this._spinGeneration++;
    }

    if (this._resultSymbols) {
      // MultiWays skip: apply pending shape and big-symbol coordinator before
      // placement so reels land at the new shape with OCCUPIED sentinels.
      const pendingShape = this._hooks.peekTargetShape();
      const visibleCellsForReel = (i: number): number =>
        pendingShape ? pendingShape[i] : this._reels[i].visibleCells;
      const decorated = this._coordinateBigSymbols(this._resultSymbols, visibleCellsForReel);

      for (const i of targets) {
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;

        if (this._hooks.isMultiWaysSlot && pendingShape) {
          // Pin migration already ran at setShape() time; reshape via the
          // shared helper that both paths use. No tween. skip is instant.
          //
          // Edge case: pins exist but the shape didn't change (`pendingShape`
          // is null). We don't refresh overlays here because they're about
          // to be destroyed in `_onSpinLanded` anyway. the cell symbols at
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
      for (const i of targets) {
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;
        reel.snapToGrid();
        reel.notifySpinEnd();
        reel.notifyLanded();
        this._markLanded(i);
      }
    }

    this._events.emit('skip:completed', { reels: [...targets], partial });
  }

  /**
   * Called by `ReelSet.setSpeed()` after the speed manager applies a
   * user-driven profile change. Sets the flag the next `spin()` checks
   * to decide whether to undo a prior `skip()` boost. Internal-only.
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
    this._clearSpinWatchdog();

    // Invalidate the in-flight phase chains BEFORE force-completing them, so
    // the `generation !== this._spinGeneration` guard that follows every
    // `await phase.run(...)` bails instead of starting the next phase -- and
    // its tweens -- on a set that is being torn down.
    this._spinGeneration++;

    // Every phase owns a gsap timeline writing reel speed and symbol view
    // positions, and `onSkip()` (reached via `forceComplete`) is the only
    // thing that kills them. Dropping the map without this left those
    // timelines on the gsap root timeline, still writing to display objects
    // that `ReelSet.destroy()` frees moments later. Consumers who drive gsap
    // from a PixiJS ticker feel it worst: the tweens do not stop when the
    // set's own app goes away, because any other live ticker keeps advancing
    // the shared root timeline.
    //
    // Safe to run the skip poses here: ReelSet.destroy() calls us before
    // reel.destroy(), so the views these tweens touch are still alive.
    for (const phase of this._activePhases.values()) {
      phase.forceComplete();
    }

    this._tickerRef.destroy();
    this._activePhases.clear();
    this._isDestroyed = true;
  }

  /**
   * Compute the target MAIN-axis cell extent for a reel given a target cell
   * count. MultiWays slots divide the fixed `multiwaysReelExtent` by the new
   * count, minus the inter-cell gaps; non-MultiWays slots return the reel's
   * current cell extent unchanged.
   *
   * The gap comes from the reel's own axis, not `symbolGap.y`. under
   * horizontal the strip is spaced by the X gap (ADR 016 section 6.6).
   */
  private _targetCellSizeFor(reel: Reel, targetCells: number): number {
    if (this._hooks.multiwaysReelExtent <= 0) return reel.cellMain;
    return (this._hooks.multiwaysReelExtent - (targetCells - 1) * reel.mainGap) / targetCells;
  }

  /**
   * Commit a reshape on one reel: emit `adjust:start`, call `reel.reshape()`,
   * refresh pin overlays, emit `adjust:complete`. Returns whether work was
   * actually done.
   *
   * **The single source of truth** for reshape orchestration. both the
   * normal AdjustPhase path AND the skip path call this. Avoids the
   * "two parallel implementations" bug magnet that previously had each
   * path duplicating the same compute-target-height + reshape + refresh +
   * emit-events logic.
   *
   * Pin migration already happened at `setShape()` time, so this method
   * only handles geometry + overlays.
   */
  private _applyReshape(reelIndex: number, targetCells: number): boolean {
    const reel = this._reels[reelIndex];
    const targetCellMain = this._targetCellSizeFor(reel, targetCells);
    const fromCells = reel.visibleCells;

    if (targetCells === fromCells && targetCellMain === reel.cellMain) {
      return false;
    }

    this._events.emit('adjust:start', { reelIndex, fromCells, toCells: targetCells });
    reel.reshape(targetCells, targetCellMain, reel.bufferStart, reel.bufferEnd);
    this._hooks.refreshPinOverlaysForReel(reelIndex);
    this._events.emit('adjust:complete', { reelIndex });
    return true;
  }

  // ── Internal ──────────────────────────────────────────

  private async _startReel(reelIndex: number, speed: SpeedProfile, generation: number): Promise<void> {
    if (this._isStale(reelIndex, generation)) return;

    const reel = this._reels[reelIndex];
    const isTumble = this._currentSpinMode === 'cascade';
    const canAdjust = this._hooks.isMultiWaysSlot && this._phaseFactory.has('adjust');

    // Cascade (classic-tumble) reshape ordering. In standard mode the reshape
    // runs between SPIN and STOP (below), where the spin blur hides a reel
    // changing height. Cascade mode has no such cover: `CascadeFallPhase` drops
    // the reel's CURRENT visible cells, so if the reshape ran after the fall the
    // reel would drop its OLD, differently-sized board and then snap to the new
    // shape. a reel visibly changing height mid-tumble. When the target shape is
    // already known at spin time (the game called `setShape()` BEFORE
    // `spin({ mode: 'cascade' })`), commit the reshape HERE, before the fall, so
    // the fall drops the reel at its target height. If the shape arrives later
    // (legacy `spin()` then `setShape()`), `peekTargetShape()` is still null and
    // this is skipped; the reshape falls back to the post-SPIN slot unchanged.
    const reshapeBeforeFall = isTumble && canAdjust && this._hooks.peekTargetShape() !== null;
    if (reshapeBeforeFall) {
      await this._runAdjustForReel(reel, reelIndex, speed, generation);
      if (this._isStale(reelIndex, generation)) return;
    }

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

    if (this._isStale(reelIndex, generation)) return;

    const spinPhase = this._phaseFactory.create<SpinPhase>('spin', reel, speed);
    this._activePhases.set(reelIndex, spinPhase);
    // A per-reel `minimumSpinTime` is what lets ONE reel land below the
    // profile's shared floor. without it the only way under the floor is the
    // all-reels slam, which is why skip granularity used to be all-or-nothing.
    const spinDone = spinPhase.run({
      minimumSpinTime: this._minimumSpinTimeFor(reelIndex),
    } satisfies SpinPhaseConfig);

    let allSpinning = true;
    for (let i = 0; i < this._reels.length; i++) {
      // Held reels never enter the phase chain, and partially-slammed reels
      // have already left it; neither gates `spin:allStarted` or the
      // stop-sequence start.
      if (this._heldReels.has(i) || this._landedReels.has(i)) continue;
      const phase = this._activePhases.get(i);
      if (!phase || phase.name !== 'spin') { allSpinning = false; break; }
    }
    if (allSpinning) {
      this._events.emit('spin:allStarted');
      this._tryBeginStopSequence();
    }

    await spinDone;
    if (this._isStale(reelIndex, generation)) return;

    // MultiWays: AdjustPhase commits the new shape and migrates pins between
    // SpinPhase and StopPhase. Inserted only when builder.multiways() was
    // called. non-MultiWays slots skip this entirely. Skipped when a cascade
    // spin already committed the reshape before the fall (see above).
    if (canAdjust && !reshapeBeforeFall) {
      await this._runAdjustForReel(reel, reelIndex, speed, generation);
      if (this._isStale(reelIndex, generation)) return;
    }

    // SpinPhase resolved (result arrived). Run ANTICIPATION (if requested) then STOP.
    const stopDelay = this._stopDelayFor(reelIndex, speed);
    const targetFrame = this._frameFor(reelIndex);

    // Effective tease hold: the per-call `duration` override wins over the
    // profile's `anticipationDelay`, so a positive override plays the tease
    // even in Turbo / SuperTurbo (whose profiles set anticipationDelay: 0).
    const antBaseDuration = this._anticipationDuration ?? speed.anticipationDelay;

    let didAnticipate = false;
    if (this._anticipationReels.includes(reelIndex) && antBaseDuration > 0) {
      // Stagger the START of the slow-down so anticipation reels tease one
      // after another instead of all at once. The reel keeps spinning at full
      // speed during this wait (its SpinPhase resolved but `reel.speed` is
      // still spinSpeed and the ticker keeps advancing it), so earlier reels
      // visibly hold while later ones stay at full blur.
      const proceed = await this._awaitAnticipationOffset(reelIndex, generation);
      if (!proceed) return; // slam / new spin superseded us during the wait

      // A dedicated tease-start signal carrying the reel's place in the
      // sequence, so games can layer per-step SFX / pitch ramps without
      // re-deriving which reels are teasing from `spin:stopping`.
      const order = this._anticipationReels.indexOf(reelIndex);
      this._teasingReels.add(reelIndex);
      // Symbols relax their spin presentation (e.g. StaticSpinSymbol fades
      // the blur out) so the slowed strip is readable during the tease.
      reel.notifyAnticipationStart();
      this._events.emit('anticipation:reel', {
        reelIndex,
        order,
        total: this._anticipationReels.length,
      });
      this._events.emit('spin:stopping', reelIndex);
      const anticipationPhase = this._phaseFactory.create<any>('anticipation', reel, speed);
      this._activePhases.set(reelIndex, anticipationPhase);
      await anticipationPhase.run(this._anticipationConfigFor(reelIndex, speed));
      if (this._isStale(reelIndex, generation)) return;
      didAnticipate = true;
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
        winnerCells: [],
        initial: true,
        delay: stopDelay,
        events: this._events,
      } satisfies CascadePlacePhaseConfig);
      if (this._isStale(reelIndex, generation)) return;

      const dropInPhase = this._phaseFactory.create<any>('cascade:dropIn', reel, speed);
      this._activePhases.set(reelIndex, dropInPhase);
      await dropInPhase.run({
        winnerCells: [],
        initial: true,
        events: this._events,
      } satisfies CascadeDropInPhaseConfig);
      if (this._isStale(reelIndex, generation)) return;
    } else {
      const stopPhase = this._phaseFactory.create<any>('stop', reel, speed);
      this._activePhases.set(reelIndex, stopPhase);
      // After a tease, carry the slow anticipation speed into the stop so the
      // reel crawls to its landing position instead of re-accelerating.
      await stopPhase.run({
        targetFrame,
        delay: stopDelay,
        preserveSpeed: didAnticipate,
      } satisfies StopPhaseConfig);
      if (this._isStale(reelIndex, generation)) return;
    }

    this._markLanded(reelIndex);
  }

  /**
   * MultiWays AdjustPhase orchestration: pull the pending shape, migrate
   * pins to their new cells, build pin-overlay tween descriptors, run the
   * phase. Emits `adjust:start` on entry and `adjust:complete` on exit.
   *
   * **Skips entirely** when there's no shape change AND no pin overlay on
   * this reel. no phase instance is constructed and no `adjust:*` events
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
    const targetCells = targetShape ? targetShape[reelIndex] : reel.visibleCells;
    const targetCellMain = this._targetCellSizeFor(reel, targetCells);

    // Build tween descriptors BEFORE the reshape commits. they capture
    // each overlay's current on-screen pose as the tween's `from` state.
    const pinOverlays = this._hooks.buildPinOverlayTweens(reelIndex, targetCellMain);

    // Commit the reshape via the shared helper (events + reel.reshape +
    // overlay refresh). Skip if no work and no overlays to tween.
    const reshapeHappened = this._applyReshape(reelIndex, targetCells);
    if (!reshapeHappened && pinOverlays.length === 0) {
      return;
    }

    // Run AdjustPhase purely as a tween phase. the geometry is already
    // committed. Phase only animates the pin overlays from their captured
    // pre-reshape pose to the new cell positions.
    if (pinOverlays.length === 0) {
      return;
    }
    const adjust = this._phaseFactory.create<any>('adjust', reel, speed);
    this._activePhases.set(reelIndex, adjust);
    await adjust.run({ pinOverlays } satisfies AdjustPhaseConfig);
  }

  /**
   * Wait for a reel's anticipation-start offset before it begins slowing.
   * Returns `false` if the spin generation changed during the wait (a slam or
   * a fresh spin superseded this task) so the caller bails cleanly.
   *
   * Offsets are keyed by tease-order (position within `_anticipationReels`),
   * not raw reel index, so teasing `[2,3,4]` spaces them `[0, S, 2S]`
   * regardless of which physical reels they are.
   */
  private async _awaitAnticipationOffset(
    reelIndex: number,
    generation: number,
  ): Promise<boolean> {
    const order = this._anticipationReels.indexOf(reelIndex);
    if (order <= 0) return true; // first tease reel starts immediately

    const stagger = this._anticipationStagger;
    if (stagger === 'sequential') {
      const prevLanded = this._reelLandedPromises.get(this._anticipationReels[order - 1]);
      if (prevLanded) {
        await prevLanded;
        if (this._isStale(reelIndex, generation)) return false;
      }
      return true;
    }

    const offsetMs = Array.isArray(stagger) ? (stagger[order] ?? 0) : order * stagger;
    if (offsetMs > 0) {
      await new Promise<void>((r) => setTimeout(r, offsetMs));
      if (this._isStale(reelIndex, generation)) return false;
    }
    return true;
  }

  /**
   * Build the per-reel AnticipationPhase config from the active `slowdown`
   * curve and `duration` override. Interpolates `from`→`to` (speed) and
   * `holdFrom`→`holdTo` (duration) across tease-order so each successive reel
   * decelerates deeper / holds longer. Base hold is the `duration` override
   * when set, else the profile's `anticipationDelay`. Returns an empty config
   * (phase defaults: 30% speed, `anticipationDelay` hold) when neither a
   * slowdown nor a duration override is configured.
   */
  private _anticipationConfigFor(
    reelIndex: number,
    speed: SpeedProfile,
  ): AnticipationPhaseConfig {
    const slowdown = this._anticipationSlowdown;
    const baseDuration = this._anticipationDuration;

    // No slowdown curve: only the (optional) duration override matters. Passing
    // it explicitly is what lets the tease run when the profile's
    // anticipationDelay is 0 (Turbo / SuperTurbo).
    if (!slowdown) {
      return baseDuration != null ? { duration: baseDuration } : {};
    }

    const count = this._anticipationReels.length;
    const order = this._anticipationReels.indexOf(reelIndex);
    // Fraction along the tease sequence: 0 for the first reel, 1 for the last.
    const f = count > 1 ? order / (count - 1) : 0;

    const from = slowdown.from ?? 0.3;
    const to = slowdown.to ?? from;
    const holdFrom = slowdown.holdFrom ?? 1;
    const holdTo = slowdown.holdTo ?? holdFrom;
    const base = baseDuration ?? speed.anticipationDelay;

    const config: AnticipationPhaseConfig = {
      speedMultiplier: from + (to - from) * f,
    };
    const holdMult = holdFrom + (holdTo - holdFrom) * f;
    // Set duration whenever an override is active OR the hold is scaled; leave
    // it off only when the plain profile hold (holdMult 1, no override) applies.
    if (baseDuration != null || holdMult !== 1) config.duration = base * holdMult;
    return config;
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
      // Held reels never enter a phase chain, and partially-slammed reels
      // have already left theirs. neither gates the stop sequence.
      if (this._heldReels.has(i) || this._landedReels.has(i)) continue;
      const phase = this._activePhases.get(i);
      if (!phase || phase.name !== 'spin') return;
    }

    // For MultiWays, the per-reel target cell count is whatever AdjustPhase
    // will reshape to. For frame-building purposes we need to send the
    // correct number of visible cells per reel. Pull the pending shape; if
    // unset, fall back to current reel.visibleCells.
    const pendingShape = this._hooks.peekTargetShape();
    const visibleCellsForReel = (i: number): number =>
      pendingShape ? pendingShape[i] : this._reels[i].visibleCells;

    // Big symbols: paint cross-reel OCCUPIED sentinels into the result grid
    // BEFORE per-reel frame building. The coordinator validates block fit
    // and rewrites cells; per-reel FrameBuilder then sees the sentinels and
    // RandomFillMiddleware skips them. Non-big-symbol slots are zero-cost.
    const decorated = this._coordinateBigSymbols(this._resultSymbols, visibleCellsForReel);

    // Build and cache frames using each reel's actual buffer/visible config.
    // Reels may differ in buffer size; build each independently. Held reels
    // get an empty placeholder. their entry is never read because no
    // StopPhase ever fires for them.
    const frames: string[][] = [];
    for (let i = 0; i < this._reels.length; i++) {
      if (this._heldReels.has(i)) {
        frames.push([]);
        continue;
      }
      const reel = this._reels[i];
      const cells = visibleCellsForReel(i);
      frames.push(
        this._frameBuilder.build(
          i,
          cells,
          reel.bufferStart,
          reel.bufferEnd,
          decorated[i],
        ),
      );
    }
    this._cachedFrames = frames;

    // Resolve all non-held SpinPhases; each reel's _startReel awaits its own
    // spinDone, then independently runs ANTICIPATION/STOP. Held reels have
    // no SpinPhase to resolve.
    for (let i = 0; i < this._reels.length; i++) {
      if (this._heldReels.has(i) || this._landedReels.has(i)) continue;
      const spinPhase = this._activePhases.get(i) as SpinPhase;
      if (spinPhase?.resolve) spinPhase.resolve();
    }
  }

  /**
   * Big symbols cross-reel coordinator. Walks the result grid, locates big
   * symbols (those with `SymbolData.size.reels * size.cells > 1`), validates that
   * the block fits within reel bounds, and paints OCCUPIED sentinels into
   * the non-anchor cells so per-reel FrameBuilder leaves them alone.
   *
   * Pure: returns a new grid; does not mutate the input. Zero-overhead for
   * slots with no big symbols (the loop runs but never matches metadata).
   */
  private _coordinateBigSymbols(
    grid: ColumnTarget[],
    visibleCellsForReel: (i: number) => number,
  ): ColumnTarget[] {
    const bufferStart = this._reels[0]?.bufferStart ?? 0;
    const bufferEnd = this._reels[0]?.bufferEnd ?? 0;
    const out = grid.map(cloneColumnTarget);
    const symData = this._hooks.symbolsData;

    // Buffer geometry is read from reel[0] and treated as uniform across
    // all reels. This holds today because `ReelSetBuilder.bufferSymbols(n)`
    // is the only buffer-setting API and applies a single global value;
    // there is no per-reel buffer API. If you ever add one (e.g. a
    // `bufferSymbolsPerReel([...])` builder method), propagate per-reel
    // values into the validator loop below: the `targetCells` lookup
    // already supports per-reel geometry; only the buffers are still
    // global here.

    // Read/write a per-reel target slot for any cell in
    // `[-bufferStart, cells + bufferEnd)`. Row is visible-relative: negative
    // cells address `bufferStart`, cells past `visible.length` address
    // `bufferEnd`. See `getTargetSlot` / `setTargetSlot`.
    const readSlot = (reel: number, cell: number): string | undefined =>
      getTargetSlot(out[reel], cell);
    const writeSlot = (reel: number, cell: number, value: string): void => {
      setTargetSlot(out[reel], cell, value);
    };

    for (let reel = 0; reel < out.length; reel++) {
      const cells = visibleCellsForReel(reel);
      // Iterate the FULL strip range, not just visible. A big-symbol anchor
      // may sit in bufferStart (partial-visibility from the top. only the
      // block's tail shows in cell 0) or in bufferEnd (the head shows at
      // the last visible cell, the rest is clipped below the mask).
      // `_finalizeFrame` sizes anchors anywhere on the strip, so the engine
      // renders both cases correctly.
      for (let cell = -bufferStart; cell < cells + bufferEnd; cell++) {
        const id = readSlot(reel, cell);
        if (id === undefined) continue;
        const meta = symData[id];
        if (!meta?.size) continue;
        const w = meta.size.reels;
        const h = meta.size.cells;
        if (w === 1 && h === 1) continue;

        // Validate block fit on this reel: anchor + h must stay on the
        // strip. The strip ends at `cells + bufferEnd - 1` (last bufferEnd
        // slot) and starts at `-bufferStart` (first bufferStart slot).
        if (cell + h > cells + bufferEnd) {
          throw new Error(
            `big symbol '${id}' (${w}x${h}) at (reel=${reel}, cell=${cell}) ` +
            `extends past the bottom of the strip on reel ${reel} ` +
            `(anchor cell + h = ${cell + h} > visibleCells + bufferEnd = ${cells + bufferEnd}).`,
          );
        }
        if (reel + w > out.length) {
          throw new Error(
            `big symbol '${id}' (${w}x${h}) at (reel=${reel}, cell=${cell}) ` +
            `exceeds reel count ${out.length}.`,
          );
        }
        for (let dx = 0; dx < w; dx++) {
          const targetReel = reel + dx;
          const targetCells = visibleCellsForReel(targetReel);
          if (cell + h > targetCells + bufferEnd) {
            throw new Error(
              `big symbol '${id}' (${w}x${h}) at (reel=${reel}, cell=${cell}) ` +
              `extends past the bottom of the strip on reel ${targetReel} ` +
              `(anchor cell + h = ${cell + h} > visibleCells + bufferEnd = ${targetCells + bufferEnd}).`,
            );
          }
        }

        // Paint OCCUPIED across the block (skip the anchor itself at dx=0,dy=0).
        // Stub cells may land in bufferStart (negative cell), visible, or
        // bufferEnd (cell >= visibleCells). `writeSlot` handles all three.
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            if (dx === 0 && dy === 0) continue;
            writeSlot(reel + dx, cell + dy, OCCUPIED_SENTINEL);
          }
        }
      }
    }
    return out;
  }

  private _markLanded(reelIndex: number): void {
    if (this._landedReels.has(reelIndex)) return;
    this._landedReels.add(reelIndex);

    // Unblock the next reel in a 'sequential' anticipation chain (no-op for
    // other stagger modes, which register no resolvers).
    const landedResolve = this._reelLandedResolvers.get(reelIndex);
    if (landedResolve) {
      this._reelLandedResolvers.delete(reelIndex);
      landedResolve();
    }

    // Tease-end signal, fired only for reels that actually teased this spin, so
    // a listener can stop that reel's tension SFX / glow without tracking the
    // anticipation set itself. Fired before `spin:reelLanded` so consumers see
    // "tease over" then "reel landed" in a natural order.
    if (this._teasingReels.delete(reelIndex)) {
      this._events.emit('anticipation:reelEnd', { reelIndex });
    }

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

  /**
   * Wire up the optional abort signal and timeout watchdog for this spin.
   * Both routes call `_abortSpin`, which force-stops the reels and rejects the
   * spin promise. Cleared by `_finishSpin` / `_abortSpin` when the spin settles.
   */
  private _armSpinWatchdog(options: SpinOptions | undefined, generation: number): void {
    this._clearSpinWatchdog();

    const signal = options?.signal;
    const timeoutMs = options?.timeoutMs;
    if (!signal && (timeoutMs === undefined || timeoutMs <= 0)) return;

    const cleanups: Array<() => void> = [];

    if (signal) {
      const onAbort = (): void => {
        if (generation !== this._spinGeneration) return;
        this._abortSpin(this._abortError(signal));
      };
      signal.addEventListener('abort', onAbort);
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
    }

    if (timeoutMs !== undefined && timeoutMs > 0) {
      const timer = setTimeout(() => {
        if (generation !== this._spinGeneration) return;
        this._abortSpin(
          new Error(
            `spin() exceeded its ${timeoutMs}ms watchdog without landing. ` +
              'setResult() / requestSkip() / slamStop() was never called (most often a ' +
              'failed or timed-out server request). The reels have been force-stopped.',
          ),
        );
      }, timeoutMs);
      cleanups.push(() => clearTimeout(timer));
    }

    this._spinWatchdogCleanup = () => {
      for (const c of cleanups) c();
    };
  }

  private _clearSpinWatchdog(): void {
    if (this._spinWatchdogCleanup) {
      this._spinWatchdogCleanup();
      this._spinWatchdogCleanup = null;
    }
  }

  private _abortError(signal: AbortSignal): Error {
    const reason = (signal as AbortSignal & { reason?: unknown }).reason;
    if (reason instanceof Error) return reason;
    if (typeof reason === 'string' && reason.length > 0) return new Error(reason);
    return new Error('spin() was aborted via SpinOptions.signal before the reels landed.');
  }

  /**
   * Force-stop an in-flight spin and reject its promise. Reuses the proven
   * `_slam()` recovery (kills phase tweens, snaps reels to a clean grid when no
   * result is set), then `_finishSpin()` rejects instead of resolving because
   * `_pendingAbortError` is set.
   */
  private _abortSpin(error: Error): void {
    if (!this._isSpinning) return;
    this._clearSpinWatchdog();
    this._pendingAbortError = error;
    this._slam();
  }

  private _finishSpin(): void {
    this._clearSpinWatchdog();

    // Abort/timeout path: reject and skip the success events. _slam() already
    // force-stopped the reels on the way here.
    const abortError = this._pendingAbortError;
    if (abortError) {
      this._pendingAbortError = null;
      this._isSpinning = false;
      this._activePhases.clear();
      this._cachedFrames = null;
      this._hooks.clearTargetShape();
      const reject = this._currentSpinReject;
      this._currentSpinResolve = null;
      this._currentSpinReject = null;
      if (reject) reject(abortError);
      return;
    }

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
    this._currentSpinReject = null;
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
