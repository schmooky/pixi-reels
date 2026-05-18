import type { gsap } from 'gsap';
import type { Container } from 'pixi.js';
import { getGsap } from '../../utils/gsapRef.js';
import { ReelPhase } from './ReelPhase.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { SpinningMode } from '../modes/SpinningMode.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';
import type { EventEmitter } from '../../events/EventEmitter.js';
import type { ReelSetEvents } from '../../events/ReelEvents.js';
import type { TumbleFallConfig } from '../../cascade/TumbleConfig.js';
import { mergeFallConfig } from '../../cascade/TumbleConfig.js';

export interface CascadeFallPhaseConfig {
  /** Required by the start-phase contract — set on the reel even though
   *  tumble mode never accelerates. */
  spinningMode: SpinningMode;
  /** Per-reel delay before this column begins its fall, in ms. */
  delay?: number;
  /** Reel-set event bus, injected by SpinController so the phase can emit
   *  `cascade:fall:*` events. */
  events: EventEmitter<ReelSetEvents>;
}

/**
 * Fall-out half of the tumble cascade. Replaces `StartPhase` when the
 * builder was configured with `.tumble(...)`.
 *
 * Runs at the moment the player presses spin: every currently-visible
 * symbol falls off the bottom of the viewport. The reel then sits at speed
 * zero while `SpinPhase` waits for the server result.
 *
 * Animation parameters (duration, ease, row stagger) are baked into the
 * phase at builder time via the factory closure; the run-time config
 * carries only per-spin context (delay, event bus).
 */
export class CascadeFallPhase extends ReelPhase<CascadeFallPhaseConfig> {
  readonly name = 'cascade:fall';
  readonly skippable = true;

  private readonly _baseFall: Required<TumbleFallConfig>;
  /** Resolved at `onEnter` time by merging the active speed profile's
   *  `tumble.fall` override (if any) over `_baseFall`. Lives only for the
   *  duration of a single run so a `setSpeed` between phases is honoured
   *  on the next entry. */
  private _fall: Required<TumbleFallConfig>;
  private _timeline: gsap.core.Timeline | null = null;
  private _delayedCall: gsap.core.Tween | null = null;
  /** Views actively being faded out. Tracked so `onSkip` can hide them
   *  rather than leaving them at mid-fall position. */
  private _fallingViews: Container[] = [];
  /** Captured on enter so `onSkip` can emit the paired `cascade:fall:end`
   *  without needing the config closure (which lives only inside `_beginFall`). */
  private _events: EventEmitter<ReelSetEvents> | null = null;
  /** Whether `cascade:fall:start` was emitted yet. `onSkip` emits the
   *  matching `:end` ONLY when `:start` already fired — a skip during the
   *  pre-fall delay window must not produce an unpaired `:end`. */
  private _startEmitted = false;
  /** Per-run abort controller exposed to listeners on `cascade:fall:symbol`
   *  as `signal`. Aborts on `onSkip` so listener-scheduled tweens (squish,
   *  badge fade, etc.) can clean themselves up alongside the library's
   *  own timeline. Stays un-aborted on natural completion — only explicit
   *  skips trigger it. */
  private _skipAbort: AbortController | null = null;

  constructor(reel: Reel, speed: SpeedProfile, fall: Required<TumbleFallConfig>) {
    super(reel, speed);
    this._baseFall = fall;
    this._fall = fall;
  }

  protected onEnter(config: CascadeFallPhaseConfig): void {
    const reel = this._reel;
    reel.spinningMode = config.spinningMode;
    reel.speed = 0;
    reel.notifySpinStart();

    // Apply speed-profile tumble override. Falls back to the build-time
    // base when the profile doesn't define one.
    this._fall = mergeFallConfig(this._baseFall, this._speed.tumble?.fall);

    this._events = config.events;
    this._startEmitted = false;
    this._skipAbort = new AbortController();

    const delaySec = (config.delay ?? 0) / 1000;
    if (delaySec > 0) {
      this._delayedCall = getGsap().delayedCall(delaySec, () => this._beginFall(config.events));
    } else {
      this._beginFall(config.events);
    }
  }

  private _beginFall(events: EventEmitter<ReelSetEvents>): void {
    this._delayedCall = null;

    const reel = this._reel;
    const cellHeight = reel.motion.slotHeight;
    const visibleRows = reel.visibleRows;
    const reelIndex = reel.reelIndex;

    // Distance: just past the bottom buffer so the symbols clear the mask.
    const fallDistance = (visibleRows + reel.bufferBelow + 1) * cellHeight;

    const fallSec = this._fall.duration / 1000;
    const staggerSec = this._fall.rowStagger / 1000;

    // Snapshot views and current Ys before any tween starts. Avoids reading
    // mid-tween Y values if `cascade:fall:symbol` listeners mutate things.
    const symbols: ReelSymbol[] = [];
    const views: Container[] = [];
    const startYs: number[] = [];
    for (let row = 0; row < visibleRows; row++) {
      const sym = reel.getSymbolAt(row);
      symbols.push(sym);
      views.push(sym.view);
      startYs.push(sym.view.y);
    }
    this._fallingViews = views;

    events.emit('cascade:fall:start', { reelIndex });
    this._startEmitted = true;

    if (fallSec <= 0) {
      // Instant fall: hide and complete. No symbol events fire (no tween
      // to attach decoration to), so the AbortController is dropped
      // un-aborted — listeners can't have registered cleanup against it.
      for (const v of views) v.alpha = 0;
      events.emit('cascade:fall:end', { reelIndex });
      this._fallingViews = [];
      // Null the start-emitted flag so a later `forceComplete` doesn't
      // re-emit `cascade:fall:end` on a phase that already balanced its
      // start/end pair.
      this._startEmitted = false;
      this._events = null;
      this._skipAbort = null;
      this._complete();
      return;
    }

    const tl = getGsap().timeline({
      onComplete: () => {
        this._timeline = null;
        for (const v of views) v.alpha = 0;
        this._fallingViews = [];
        events.emit('cascade:fall:end', { reelIndex });
        this._startEmitted = false;
        this._events = null;
        // Natural completion: drop the controller un-aborted. Listener
        // tweens scheduled off `cascade:fall:symbol` are expected to
        // settle on their own timeline.
        this._skipAbort = null;
        this._complete();
      },
    });
    this._timeline = tl;

    const reverseOrder = this._fall.rowOrder === 'bottomToTop';

    for (let row = 0; row < visibleRows; row++) {
      const view = views[row];
      const symbol = symbols[row];
      const startY = startYs[row];
      const orderIndex = reverseOrder ? visibleRows - 1 - row : row;
      const offset = orderIndex * staggerSec;

      // Fire the per-symbol event right before the tween starts so listeners
      // can stage parallel tweens with full knowledge of duration/ease.
      // `signal` aborts when this phase is skipped, so listener-scheduled
      // tweens (squish, badge, etc.) can be cleaned up alongside the
      // library's own timeline.
      tl.call(
        () => {
          const signal = this._skipAbort?.signal;
          if (!signal) return;
          events.emit('cascade:fall:symbol', {
            symbol,
            view,
            reelIndex,
            rowIndex: row,
            duration: this._fall.duration,
            ease: this._fall.ease,
            distance: fallDistance,
            signal,
          });
        },
        undefined,
        offset,
      );

      tl.to(view, {
        y: startY + fallDistance,
        duration: fallSec,
        ease: this._fall.ease,
      }, offset);
    }
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    this._kill();
    for (const v of this._fallingViews) v.alpha = 0;
    this._fallingViews = [];
    // Abort BEFORE emitting `:end` so listeners registered against
    // `signal` see the cancellation in the same microtask their `:end`
    // handler would (some consumers branch on `wasSkipped`-flavoured
    // state and rely on the order).
    if (this._skipAbort && !this._skipAbort.signal.aborted) {
      this._skipAbort.abort();
    }
    this._skipAbort = null;
    // Emit the paired `cascade:fall:end` so listeners that count
    // start/end events stay balanced. Only emit if `:start` already
    // fired — a skip during the pre-fall delay window has no
    // matching `:start`, so an `:end` here would be unpaired.
    if (this._startEmitted && this._events) {
      this._events.emit('cascade:fall:end', { reelIndex: this._reel.reelIndex });
    }
    this._startEmitted = false;
    this._events = null;
  }

  private _kill(): void {
    if (this._delayedCall) {
      this._delayedCall.kill();
      this._delayedCall = null;
    }
    if (this._timeline) {
      this._timeline.kill();
      this._timeline = null;
    }
  }
}
