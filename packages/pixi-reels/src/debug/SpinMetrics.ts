import type { Ticker } from 'pixi.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { SkipMode } from '../config/types.js';
import type { SkipInfo, SpinResult } from '../events/ReelEvents.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';

/** One phase a reel ran, in ms since its round opened. */
export interface DebugPhaseSpan {
  phase: string;
  start: number;
  /** `null` while the phase is still running. */
  end: number | null;
}

/** A skip press, as the round saw it. */
export interface DebugSkipMark {
  /** When `skip:requested` fired, ms since the round opened. */
  at: number;
  mode: SkipMode;
  /** The reels the press freed. */
  reels: number[];
  /** `true` when reels were still spinning after the press. */
  partial: boolean;
  /** When its reels were down (`skip:completed`). `null` until then. */
  completedAt: number | null;
}

/** One reel's share of a round. Every time is ms since the round opened. */
export interface DebugReelRound {
  reel: number;
  /** Every phase the reel entered this round, in order. */
  phases: DebugPhaseSpan[];
  /** `spin:stopping`: the controller asked this reel to stop. */
  stoppingAt: number | null;
  /** `spin:reelLanding`: on its result frame, bounce not started yet. */
  landingAt: number | null;
  /** `spin:reelLanded`: fully at rest. */
  landedAt: number | null;
  /** The anticipation tease, when the reel teased. */
  tease: { start: number; end: number | null; order: number; total: number } | null;
  /** `symbol:created` count: how many symbols the pool had to build. */
  symbolsCreated: number;
  /**
   * `reel.speedNormalized` samples as flat `[t0, v0, t1, v1, ...]`. Only
   * recorded when the metrics were given a ticker; empty otherwise.
   */
  speed: number[];
}

/**
 * A round: everything from one `spin:start` to the next. A cascade
 * `refill()` emits `spin:start` too, so each refill is its own round, the
 * same way the engine's own events count it. A nudge at rest before any
 * spin opens a round of its own (`spin: false`).
 */
export interface DebugRound {
  /** 1 for the first round this recorder saw. */
  index: number;
  /** `false` when something other than `spin:start` opened the round. */
  spin: boolean;
  /** The recorder clock when the round opened. Every other time is relative to it. */
  startedAt: number;
  /** Speed profile active when the round opened. */
  profile: string;
  allStartedAt: number | null;
  allLandedAt: number | null;
  completeAt: number | null;
  /** `SpinResult.duration`, once `spin:complete` fires. */
  duration: number | null;
  wasSkipped: boolean;
  skips: DebugSkipMark[];
  /** A `requestSkip()` that came before the result (`skip:queued`). */
  queuedSkipAt: number | null;
  /** `skip:boosted`: the first press switched to the fastest profile. */
  boosted: boolean;
  reels: DebugReelRound[];
  /** Reel indices in the order they came to rest. */
  landOrder: number[];
  /** Events on the set bus and every reel bus this round. */
  events: number;
  /** `cascade:chain:start` count. */
  cascadeChains: number;
  /** `win:group` count. */
  wins: number;
  /** Last time anything was recorded, ms since the round opened. */
  lastActivityAt: number;
}

/** Aggregates across every round the recorder still holds. */
export interface DebugMetricsTotals {
  /** Rounds opened since the recorder was created, including dropped ones. */
  rounds: number;
  /** Rounds in the kept window that were skipped. */
  skipped: number;
  /** Mean `duration` of the completed rounds in the kept window, ms. `null` when none completed. */
  averageDuration: number | null;
}

/** Plain-JSON view of a {@link SpinMetrics}. Safe to `JSON.stringify`. */
export interface SpinMetricsSnapshot {
  rounds: DebugRound[];
  totals: DebugMetricsTotals;
}

export interface SpinMetricsOptions {
  /** Clock, in ms. Defaults to `performance.now()`. Tests pass a fake one. */
  now?: () => number;
  /** Rounds kept; the oldest drops. Default 20. */
  history?: number;
  /**
   * Ticker to sample each reel's `speedNormalized` on. Without one, rounds
   * carry no speed trace, which is all the events alone can tell.
   */
  ticker?: Ticker;
  /** Minimum ms between two speed samples. Default 33 (about 30 Hz). */
  sampleMs?: number;
}

const DEFAULT_HISTORY = 20;
const DEFAULT_SAMPLE_MS = 33;
/**
 * Samples kept per reel per round. 30 s at the default rate: a round that
 * runs longer keeps its first 30 s of trace rather than growing without bound.
 */
const MAX_SAMPLES = 1800;

/**
 * Records what each spin did, per reel, on a clock: when every phase started
 * and ended, when the reel was asked to stop, landed and settled, the tease
 * window, every skip press, and how many symbols the pool had to build.
 *
 * Event-driven: it listens on the set bus and on every reel's bus, so it costs
 * nothing between spins. Given a `ticker`, it also samples each reel's
 * normalized speed while a round runs, which is what lets a timeline show the
 * shape of a tease instead of only its start and end.
 *
 * Dev-only, like the rest of `pixi-reels/debug`: the record shape follows the
 * engine's events and is not semver-protected.
 *
 * ```ts
 * const metrics = new SpinMetrics(reelSet, { ticker: app.ticker });
 * await reelSet.spin();
 * metrics.current?.reels[4].tease; // { start: 912, end: 1840, order: 1, total: 2 }
 * metrics.destroy();
 * ```
 */
export class SpinMetrics implements Disposable {
  private _rounds: DebugRound[] = [];
  private _total = 0;
  private _now: () => number;
  private _history: number;
  private _sampleMs: number;
  private _lastSampleAt = Number.NEGATIVE_INFINITY;
  private _tickerRef: TickerRef | null = null;
  private _detach: Array<() => void> = [];
  private _isDestroyed = false;

  constructor(
    private _reelSet: ReelSet,
    options: SpinMetricsOptions = {},
  ) {
    this._now = options.now ?? (() => performance.now());
    this._history = Math.max(1, options.history ?? DEFAULT_HISTORY);
    this._sampleMs = Math.max(0, options.sampleMs ?? DEFAULT_SAMPLE_MS);

    const onSet = (event: string, ...args: unknown[]): void => this._onSetEvent(event, args);
    _reelSet.events.onAny(onSet);
    this._detach.push(() => _reelSet.events.offAny(onSet));

    _reelSet.reels.forEach((reel, i) => this._attachReel(reel, i));

    if (options.ticker) {
      this._tickerRef = new TickerRef(options.ticker);
      this._tickerRef.add(() => this._sample());
    }
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** The latest round, running or settled. `null` before anything happened. */
  get current(): DebugRound | null {
    return this._rounds.length ? this._rounds[this._rounds.length - 1] : null;
  }

  /** The kept rounds, oldest first. The last one is {@link current}. */
  get rounds(): readonly DebugRound[] {
    return this._rounds;
  }

  /**
   * Whether the current round is still moving: a reel is inside a phase, or a
   * spin has not reached `spin:complete` yet.
   */
  get isActive(): boolean {
    const r = this.current;
    if (!r) return false;
    if (r.spin && r.completeAt === null) return true;
    return r.reels.some((reel) => reel.phases.some((p) => p.end === null));
  }

  /**
   * How long the current round has lasted, ms: the live clock while it is
   * active, its last recorded activity once it has settled. `0` before any
   * round. This is the length a timeline should span.
   */
  get length(): number {
    const r = this.current;
    if (!r) return 0;
    return this.isActive ? this._now() - r.startedAt : r.lastActivityAt;
  }

  get totals(): DebugMetricsTotals {
    const done = this._rounds.filter((r) => r.duration !== null);
    return {
      rounds: this._total,
      skipped: this._rounds.filter((r) => r.wasSkipped).length,
      averageDuration: done.length
        ? done.reduce((sum, r) => sum + (r.duration ?? 0), 0) / done.length
        : null,
    };
  }

  /** A deep, plain-JSON copy of every kept round plus the totals. */
  snapshot(): SpinMetricsSnapshot {
    return {
      rounds: JSON.parse(JSON.stringify(this._rounds)) as DebugRound[],
      totals: this.totals,
    };
  }

  /** Forget every kept round. The round counter keeps counting. */
  clear(): void {
    this._rounds.length = 0;
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this._tickerRef?.destroy();
    this._tickerRef = null;
    for (const detach of this._detach) detach();
    this._detach.length = 0;
  }

  // --- recording -----------------------------------------------------------

  private _open(spin: boolean): DebugRound {
    const round: DebugRound = {
      index: ++this._total,
      spin,
      startedAt: this._now(),
      profile: this._reelSet.speed.activeName,
      allStartedAt: null,
      allLandedAt: null,
      completeAt: null,
      duration: null,
      wasSkipped: false,
      skips: [],
      queuedSkipAt: null,
      boosted: false,
      reels: this._reelSet.reels.map((_, reel) => ({
        reel,
        phases: [],
        stoppingAt: null,
        landingAt: null,
        landedAt: null,
        tease: null,
        symbolsCreated: 0,
        speed: [],
      })),
      landOrder: [],
      events: 0,
      cascadeChains: 0,
      wins: 0,
      lastActivityAt: 0,
    };
    this._rounds.push(round);
    if (this._rounds.length > this._history) {
      this._rounds.splice(0, this._rounds.length - this._history);
    }
    this._lastSampleAt = Number.NEGATIVE_INFINITY;
    return round;
  }

  /** The round an event belongs to, opening one when nothing is recorded yet. */
  private _round(): DebugRound {
    return this.current ?? this._open(false);
  }

  /** ms since the round opened, and mark it as the round's latest activity. */
  private _stamp(round: DebugRound): number {
    const t = this._now() - round.startedAt;
    round.events++;
    if (t > round.lastActivityAt) round.lastActivityAt = t;
    return t;
  }

  /** Listen on one reel's bus. Reels a growing set adds later come through here too. */
  private _attachReel(reel: ReelSet['reels'][number], index: number): void {
    const onReel = (event: string, ...args: unknown[]): void => this._onReelEvent(index, event, args);
    reel.events.onAny(onReel);
    this._detach.push(() => reel.events.offAny(onReel));
  }

  private _onSetEvent(event: string, args: unknown[]): void {
    if (event === 'destroyed') {
      this.destroy();
      return;
    }
    if (event === 'reels:added') {
      // The next round's `spin:start` sizes its per-reel record to the new
      // board; the reels' own buses need listening to from now on.
      const { from, count } = args[0] as { from: number; count: number };
      for (let i = from; i < from + count; i++) this._attachReel(this._reelSet.reels[i], i);
      return;
    }
    const round = event === 'spin:start' ? this._open(true) : this._round();
    const t = this._stamp(round);
    switch (event) {
      case 'spin:allStarted':
        round.allStartedAt = t;
        break;
      case 'spin:stopping': {
        const reel = round.reels[args[0] as number];
        if (reel && reel.stoppingAt === null) reel.stoppingAt = t;
        break;
      }
      case 'spin:reelLanding': {
        const reel = round.reels[args[0] as number];
        if (reel && reel.landingAt === null) reel.landingAt = t;
        break;
      }
      case 'spin:reelLanded': {
        const index = args[0] as number;
        const reel = round.reels[index];
        if (reel) {
          reel.landedAt = t;
          if (!round.landOrder.includes(index)) round.landOrder.push(index);
        }
        break;
      }
      case 'anticipation:reel': {
        const info = args[0] as { reelIndex: number; order: number; total: number };
        const reel = round.reels[info.reelIndex];
        if (reel) reel.tease = { start: t, end: null, order: info.order, total: info.total };
        break;
      }
      case 'anticipation:reelEnd': {
        const info = args[0] as { reelIndex: number };
        const tease = round.reels[info.reelIndex]?.tease;
        if (tease) tease.end = t;
        break;
      }
      case 'spin:allLanded':
        round.allLandedAt = t;
        break;
      case 'spin:complete': {
        const result = args[0] as SpinResult;
        round.completeAt = t;
        round.duration = result.duration;
        round.wasSkipped = result.wasSkipped;
        break;
      }
      case 'skip:requested': {
        const info = args[0] as SkipInfo;
        round.skips.push({
          at: t,
          mode: info.mode,
          reels: [...info.reels],
          partial: info.partial,
          completedAt: null,
        });
        break;
      }
      case 'skip:completed': {
        const info = args[0] as SkipInfo;
        // The oldest open press with the same reels is the one completing.
        const mark = round.skips.find(
          (s) => s.completedAt === null && s.reels.join() === info.reels.join(),
        );
        if (mark) mark.completedAt = t;
        break;
      }
      case 'skip:queued':
        round.queuedSkipAt = t;
        break;
      case 'skip:boosted':
        round.boosted = true;
        break;
      case 'cascade:chain:start':
        round.cascadeChains++;
        break;
      case 'win:group':
        round.wins++;
        break;
    }
  }

  private _onReelEvent(index: number, event: string, args: unknown[]): void {
    if (event === 'destroyed') return;
    const round = this._round();
    const reel = round.reels[index];
    if (!reel) return;
    const t = this._stamp(round);
    switch (event) {
      case 'phase:enter':
        reel.phases.push({ phase: args[0] as string, start: t, end: null });
        break;
      case 'phase:exit': {
        const name = args[0] as string;
        for (let k = reel.phases.length - 1; k >= 0; k--) {
          const span = reel.phases[k];
          if (span.phase === name && span.end === null) {
            span.end = t;
            break;
          }
        }
        break;
      }
      case 'symbol:created':
        reel.symbolsCreated++;
        break;
    }
  }

  private _sample(): void {
    const round = this.current;
    if (!round || !this.isActive) return;
    const t = this._now() - round.startedAt;
    if (t - this._lastSampleAt < this._sampleMs) return;
    this._lastSampleAt = t;
    const reels = this._reelSet.reels;
    for (let i = 0; i < round.reels.length && i < reels.length; i++) {
      const trace = round.reels[i].speed;
      if (trace.length >= MAX_SAMPLES * 2) continue;
      trace.push(t, reels[i].speedNormalized);
    }
  }
}
