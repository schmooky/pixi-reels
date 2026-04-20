import type { Ticker } from 'pixi.js';
import type { Reel } from '../core/Reel.js';
import type { SpeedProfile } from '../config/types.js';
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
import type { SpinningMode } from './modes/SpinningMode.js';
import { StandardMode } from './modes/StandardMode.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';

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
  ) {
    this._reels = reels;
    this._speedManager = speedManager;
    this._frameBuilder = frameBuilder;
    this._phaseFactory = phaseFactory;
    this._events = events;
    this._tickerRef = new TickerRef(ticker);
    this._spinningMode = spinningMode ?? new StandardMode();

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
      for (let i = 0; i < this._reels.length; i++) {
        if (this._landedReels.has(i)) continue;
        const reel = this._reels[i];
        reel.speed = 0;
        reel.isStopping = false;
        reel.placeSymbols(this._resultSymbols[i]);
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

    // Build and cache frames using each reel's actual buffer/visible config.
    // Reels may differ in buffer size; build each independently.
    const frames: string[][] = [];
    for (let i = 0; i < this._reels.length; i++) {
      const reel = this._reels[i];
      frames.push(
        this._frameBuilder.build(
          i,
          reel.visibleRows,
          reel.bufferAbove,
          reel.bufferBelow,
          this._resultSymbols[i],
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
