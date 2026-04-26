import type { Ticker } from 'pixi.js';
import type { Reel } from '../core/Reel.js';
import type { SpeedProfile, SymbolData } from '../config/types.js';
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
import type { SpinningMode } from './modes/SpinningMode.js';
import { StandardMode } from './modes/StandardMode.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';
import { OCCUPIED_SENTINEL } from '../core/Reel.js';
import type { CellPin } from '../pins/CellPin.js';

/**
 * Megaways/big-symbol coordination hook injected by `ReelSet` into
 * `SpinController`. All callbacks are no-ops (and `isMegawaysSlot=false`)
 * for non-Megaways slots, so the standard chain is unchanged.
 */
export interface SpinControllerHooks {
  isMegawaysSlot: boolean;
  symbolsData: Record<string, SymbolData>;
  /** Read pending Megaways shape. Returns null when no shape is pending. */
  consumeTargetShape(): number[] | null;
  /** Clear pending shape after AdjustPhase runs. */
  clearTargetShape(): void;
  /** Reel pixel-box height for Megaways cell-height derivation. */
  megawaysReelPixelHeight: number;
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
   * AdjustPhase commits a Megaways reshape so overlays move to their new
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
  private _hooks: SpinControllerHooks;

  private _isSpinning = false;
  private _spinStartTime = 0;
  private _resultSymbols: string[][] | null = null;
  private _anticipationReels: number[] = [];
  private _stopDelayOverride: number[] | null = null;
  private _activePhases: Map<number, ReelPhase<any>> = new Map();
  private _landedReels = new Set<number>();
  private _wasSkipped = false;
  private _isDestroyed = false;
  private _currentSpinResolve: ((result: SpinResult) => void) | null = null;
  /** Incremented on each new spin. If a callback sees a stale generation, it no-ops. */
  private _spinGeneration = 0;

  constructor(
    reels: Reel[],
    speedManager: SpeedManager,
    frameBuilder: FrameBuilder,
    phaseFactory: PhaseFactory,
    events: EventEmitter<ReelSetEvents>,
    ticker: Ticker,
    spinningMode?: SpinningMode,
    hooks?: SpinControllerHooks,
  ) {
    this._reels = reels;
    this._speedManager = speedManager;
    this._frameBuilder = frameBuilder;
    this._phaseFactory = phaseFactory;
    this._events = events;
    this._tickerRef = new TickerRef(ticker);
    this._spinningMode = spinningMode ?? new StandardMode();
    this._hooks = hooks ?? {
      isMegawaysSlot: false,
      symbolsData: {},
      consumeTargetShape: () => null,
      clearTargetShape: () => {},
      megawaysReelPixelHeight: 0,
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

  async spin(): Promise<SpinResult> {
    if (this._isSpinning) {
      throw new Error('Cannot start a new spin while one is in progress.');
    }

    this._isSpinning = true;
    this._wasSkipped = false;
    this._spinStartTime = performance.now();
    this._resultSymbols = null;
    this._anticipationReels = [];
    this._stopDelayOverride = null;
    this._landedReels.clear();
    this._activePhases.clear();
    this._spinGeneration++;

    const generation = this._spinGeneration;
    const speed = this._speedManager.active;

    this._events.emit('spin:start');

    const resultPromise = new Promise<SpinResult>((resolve) => {
      this._currentSpinResolve = resolve;
    });

    for (let i = 0; i < this._reels.length; i++) {
      this._startReel(i, speed, generation);
    }

    return resultPromise;
  }

  setResult(symbols: string[][]): void {
    if (!this._isSpinning) return;
    // Fail-fast: validate big-symbol block fit so setResult throws at the
    // call site rather than later inside skip()/_tryBeginStopSequence().
    const visibleRowsForReel = (i: number): number => {
      const pendingShape = this._hooks.consumeTargetShape();
      return pendingShape ? pendingShape[i] : this._reels[i].visibleRows;
    };
    this._coordinateBigSymbols(symbols, visibleRowsForReel);
    this._resultSymbols = symbols;
    this._tryBeginStopSequence();
  }

  setAnticipation(reelIndices: number[]): void {
    this._anticipationReels = reelIndices;
  }

  /**
   * Override the per-reel stop delay (in ms). Pass one value per reel.
   * When set, these replace the staggered `reelIndex * speed.stopDelay`
   * pattern for the current spin. Cleared at the start of each new spin.
   */
  setStopDelays(delays: number[]): void {
    this._stopDelayOverride = [...delays];
  }

  skip(): void {
    if (!this._isSpinning) return;

    this._wasSkipped = true;
    this._events.emit('skip:requested');

    for (const [, phase] of this._activePhases) {
      phase.forceComplete();
    }
    this._activePhases.clear();

    this._spinGeneration++;

    if (this._resultSymbols) {
      // Megaways skip: apply pending shape and big-symbol coordinator before
      // placement so reels land at the new shape with OCCUPIED sentinels.
      const pendingShape = this._hooks.consumeTargetShape();
      const visibleRowsForReel = (i: number): number =>
        pendingShape ? pendingShape[i] : this._reels[i].visibleRows;
      const decorated = this._coordinateBigSymbols(this._resultSymbols, visibleRowsForReel);

      for (let i = 0; i < this._reels.length; i++) {
        if (this._landedReels.has(i)) continue;
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;

        if (this._hooks.isMegawaysSlot && pendingShape) {
          const targetRows = pendingShape[i];
          const targetSymbolHeight =
            this._hooks.megawaysReelPixelHeight > 0
              ? (this._hooks.megawaysReelPixelHeight - (targetRows - 1) * this._hooks.symbolGapY) / targetRows
              : reel.symbolHeight;
          if (targetRows !== reel.visibleRows || targetSymbolHeight !== reel.symbolHeight) {
            this._hooks.migratePinsForReel(i, targetRows);
            const fromRows = reel.visibleRows;
            reel.reshape(targetRows, targetSymbolHeight, reel.bufferAbove, reel.bufferBelow);
            this._hooks.refreshPinOverlaysForReel(i);
            this._events.emit('adjust:start', { reelIndex: i, fromRows, toRows: targetRows });
            this._events.emit('adjust:complete', { reelIndex: i });
          }
        }

        reel.placeSymbols(decorated[i]);
        this._markLanded(i);
      }
    } else {
      for (let i = 0; i < this._reels.length; i++) {
        if (this._landedReels.has(i)) continue;
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;
        reel.snapToGrid();
        this._markLanded(i);
      }
    }

    this._events.emit('skip:completed');
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._tickerRef.destroy();
    this._activePhases.clear();
    this._isDestroyed = true;
  }

  // ── Internal ──────────────────────────────────────────

  private async _startReel(reelIndex: number, speed: SpeedProfile, generation: number): Promise<void> {
    if (generation !== this._spinGeneration) return;

    const reel = this._reels[reelIndex];

    // START → SPIN: chain via phase.run() promises (no busy-polling).
    const startPhase = this._phaseFactory.create<any>('start', reel, speed);
    this._activePhases.set(reelIndex, startPhase);
    await startPhase.run({
      spinningMode: this._spinningMode,
      delay: reelIndex * speed.spinDelay,
    } as StartPhaseConfig);

    if (generation !== this._spinGeneration) return;

    const spinPhase = this._phaseFactory.create<SpinPhase>('spin', reel, speed);
    this._activePhases.set(reelIndex, spinPhase);
    const spinDone = spinPhase.run({});

    let allSpinning = true;
    for (let i = 0; i < this._reels.length; i++) {
      const phase = this._activePhases.get(i);
      if (!phase || phase.name !== 'spin') { allSpinning = false; break; }
    }
    if (allSpinning) {
      this._events.emit('spin:allStarted');
      this._tryBeginStopSequence();
    }

    await spinDone;
    if (generation !== this._spinGeneration) return;

    // Megaways: AdjustPhase commits the new shape and migrates pins between
    // SpinPhase and StopPhase. Inserted only when builder.megaways() was
    // called — non-Megaways slots skip this entirely.
    if (this._hooks.isMegawaysSlot && this._phaseFactory.has('adjust')) {
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

    const stopPhase = this._phaseFactory.create<any>('stop', reel, speed);
    this._activePhases.set(reelIndex, stopPhase);
    await stopPhase.run({ targetFrame, delay: stopDelay } as StopPhaseConfig);
    if (generation !== this._spinGeneration) return;

    this._markLanded(reelIndex);
  }

  /**
   * Megaways AdjustPhase orchestration: pull the pending shape, migrate
   * pins to their new rows, build pin-overlay tween descriptors, run the
   * phase. Emits `adjust:start` on entry and `adjust:complete` on exit.
   */
  private async _runAdjustForReel(
    reel: Reel,
    reelIndex: number,
    speed: SpeedProfile,
    generation: number,
  ): Promise<void> {
    const targetShape = this._hooks.consumeTargetShape();
    const targetRows = targetShape ? targetShape[reelIndex] : reel.visibleRows;
    const targetSymbolHeight =
      this._hooks.megawaysReelPixelHeight > 0
        ? (this._hooks.megawaysReelPixelHeight - (targetRows - 1) * this._hooks.symbolGapY) / targetRows
        : reel.symbolHeight;

    const fromRows = reel.visibleRows;
    this._events.emit('adjust:start', { reelIndex, fromRows, toRows: targetRows });

    // Pin migration already happened at `setShape()` time (eagerly, so
    // setResult's pin overlay sees the correct rows). Now build tween
    // descriptors that capture the overlays' CURRENT (pre-reshape) on-
    // screen pose so AdjustPhase can interpolate from there to the new
    // cell. Must be done BEFORE AdjustPhase calls reel.reshape() —
    // otherwise we'd snapshot post-reshape Y values and the tween would
    // start from the destination.
    const pinOverlays = this._hooks.buildPinOverlayTweens(
      reelIndex,
      targetSymbolHeight,
      this._hooks.symbolGapY,
    );

    const adjust = this._phaseFactory.create<any>('adjust', reel, speed);
    this._activePhases.set(reelIndex, adjust);
    const config: AdjustPhaseConfig = {
      targetRows,
      targetSymbolHeight,
      pinOverlays,
    };
    await adjust.run(config);

    if (generation !== this._spinGeneration) return;

    // AdjustPhase has already snapped overlays to their final cells (via
    // its onComplete settle path). For safety against any extreme custom
    // ease that leaves a sub-pixel residue, snap again here.
    this._hooks.refreshPinOverlaysForReel(reelIndex);

    this._events.emit('adjust:complete', { reelIndex });
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
      const phase = this._activePhases.get(i);
      if (!phase || phase.name !== 'spin') return;
    }

    // For Megaways, the per-reel target row count is whatever AdjustPhase
    // will reshape to. For frame-building purposes we need to send the
    // correct number of visible rows per reel. Pull the pending shape; if
    // unset, fall back to current reel.visibleRows.
    const pendingShape = this._hooks.consumeTargetShape();
    const visibleRowsForReel = (i: number): number =>
      pendingShape ? pendingShape[i] : this._reels[i].visibleRows;

    // Big symbols: paint cross-reel OCCUPIED sentinels into the result grid
    // BEFORE per-reel frame building. The coordinator validates block fit
    // and rewrites cells; per-reel FrameBuilder then sees the sentinels and
    // RandomFillMiddleware skips them. Non-big-symbol slots are zero-cost.
    const decorated = this._coordinateBigSymbols(this._resultSymbols, visibleRowsForReel);

    // Build and cache frames using each reel's actual buffer/visible config.
    // Reels may differ in buffer size; build each independently.
    const frames: string[][] = [];
    for (let i = 0; i < this._reels.length; i++) {
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

    // Resolve all SpinPhases; each reel's _startReel awaits its own spinDone,
    // then independently runs ANTICIPATION/STOP.
    for (let i = 0; i < this._reels.length; i++) {
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
   */
  private _coordinateBigSymbols(
    grid: string[][],
    visibleRowsForReel: (i: number) => number,
  ): string[][] {
    const out = grid.map((col) => [...col]);
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

    if (this._landedReels.size === this._reels.length) {
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
    // Megaways: the target shape was applied this spin; clear it so the next
    // spin starts fresh. Non-Megaways: this is a no-op.
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
