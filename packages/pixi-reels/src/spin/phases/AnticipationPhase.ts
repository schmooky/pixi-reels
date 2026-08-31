import type { gsap } from 'gsap';
import type { AnticipationSegment } from '../../config/types.js';
import type { EventEmitter } from '../../events/EventEmitter.js';
import type { ReelSetEvents } from '../../events/ReelEvents.js';
import { noticeWarnOnce } from '../../utils/notify.js';
import { ReelPhase } from './ReelPhase.js';

export interface AnticipationPhaseConfig {
  /** Duration override in ms. Uses speed profile anticipationDelay if not set. */
  duration?: number;
  /** Speed multiplier during anticipation. Default: 0.3 (30% of spin speed). */
  speedMultiplier?: number;
  /**
   * Explicit speed legs, replacing the built-in decelerate-then-hold. Resolved
   * by the controller from `setAnticipation(..., { curve })`, including the
   * per-reel function form. When present, `speedMultiplier` is ignored and
   * `duration` only decides whether the tease runs at all.
   */
  curve?: AnticipationSegment[];
  /**
   * End the tease once the reel has travelled this many symbol pitches,
   * instead of after the scripted hold. See `AnticipationOptions.cells`.
   */
  cells?: number;
  /** Set-level emitter, for `anticipation:segment`. Passed by the controller. */
  events?: EventEmitter<ReelSetEvents>;
  /** This reel's index, for the events above. */
  reelIndex?: number;
}

/** Ease for a curve segment that does not name one. See {@link AnticipationSegment.ease}. */
const DEFAULT_CURVE_EASE = 'power2.inOut';

/** Speed gap (px/frame) under which a drive counts as having reached its target. */
const DRIVE_ARRIVAL_EPS = 0.5;

/**
 * Anticipation phase: the tease before a reel stops.
 *
 * Two shapes, picked by the config:
 *
 * **Legacy (no `curve`).** Decelerates to a fraction of spin speed over the
 * first 35% of the hold with `power2.out`, then sits there for the remaining
 * 65%. Unchanged from 2.3 and still the default, so existing games look
 * identical.
 *
 * **Curve.** Plays `config.curve` leg by leg: ease the speed to each segment's
 * target, hold, move on. Segments may ask for MORE than spin speed, so a
 * surge-then-crawl tease is expressible. Segment eases default to
 * `power2.inOut` rather than `power2.out`, because an ease-out on a speed value
 * puts peak deceleration on the first frame - a step in acceleration, which is
 * what makes the legacy tease read as a setting change rather than as the reel
 * slowing down.
 *
 * **Travel anchor.** With `config.cells`, the FINAL leg holds until the reel
 * has covered that many symbol pitches instead of for its scripted `hold`, so
 * the end of the tease is cut to symbols going past the window rather than to
 * a clock. Earlier legs always play in full: a travel target that could cut
 * the curve short mid-surge would silently delete legs the caller wrote. A
 * reel that comes to rest can never reach a travel target, so `duration` still
 * runs as the backstop on that final leg.
 *
 * Either way the controller runs StopPhase with `preserveSpeed: true`
 * afterwards, so the speed the tease ends on carries into the spin-out and the
 * reel crawls onto its landing frame instead of re-accelerating.
 *
 * Under the `'drive'` motion model the phase assigns `reel.targetSpeed` per
 * segment and waits for the reel to arrive, letting the drive's acceleration
 * bounds shape every transition instead of an ease.
 */
export class AnticipationPhase extends ReelPhase<AnticipationPhaseConfig> {
  readonly name = 'anticipation';
  readonly skippable = true;

  private _tween: gsap.core.Timeline | null = null;
  private _delayed: gsap.core.Tween | null = null;

  /** Odometer reading (in cells) the travel target is measured from. */
  private _travelMark = 0;
  /** Travel target in cells, or `null` when this tease is time-anchored. */
  private _cells: number | null = null;
  /**
   * True once the odometer is being watched. A curve arms it only on its FINAL
   * leg, so a fast early segment cannot eat the travel budget and end the tease
   * before the legs the caller wrote have played.
   */
  private _travelArmed = false;
  /** Curve legs still to play, when driving segments by hand. */
  private _segments: AnticipationSegment[] = [];
  private _segmentIndex = 0;
  /**
   * Backstop in ms for a travel-anchored final leg: a reel that comes to rest
   * can never reach a cell target, and a tease that never ends is a hung spin.
   */
  private _backstopMs = 0;
  private _events: EventEmitter<ReelSetEvents> | null = null;
  private _reelIndex = -1;

  protected onEnter(config: AnticipationPhaseConfig): void {
    const reel = this._reel;
    const speed = this._speed;
    const duration = (config.duration ?? speed.anticipationDelay) / 1000;

    if (duration <= 0) {
      this._complete();
      return;
    }

    this._cells = config.cells != null && config.cells > 0 ? config.cells : null;
    this._travelArmed = false;
    this._travelMark = reel.travelledCells;
    this._backstopMs = duration * 1000;
    this._events = config.events ?? null;
    this._reelIndex = config.reelIndex ?? -1;

    if (config.curve && config.curve.length > 0) {
      this._segments = config.curve;
      this._segmentIndex = 0;
      this._runSegment();
      return;
    }

    const targetSpeed = speed.spinSpeed * (config.speedMultiplier ?? 0.3);
    this._segments = [];
    // The legacy tease is one leg, so its only leg is also its last: arm the
    // travel watch immediately.
    this._travelArmed = this._cells != null;

    if (reel.hasDrive) {
      // The drive shapes the ramp; the phase only says where to go and how long
      // the whole tease lasts.
      reel.targetSpeed = targetSpeed;
      this._holdFor(duration * 1000, () => this._complete());
      return;
    }

    this._tween = reel.gsap.timeline();
    this._tween.to(reel, {
      speed: targetSpeed,
      duration: duration * 0.35,
      ease: 'power2.out',
    });
    this._tween.to({}, { duration: duration * 0.65, onComplete: () => this._complete() });
  }

  /** Play `_segments[_segmentIndex]`, then chain to the next or finish. */
  private _runSegment(): void {
    const seg = this._segments[this._segmentIndex];
    if (!seg) {
      this._complete();
      return;
    }
    const reel = this._reel;
    const target = this._speed.spinSpeed * seg.speed;
    const isLast = this._segmentIndex === this._segments.length - 1;
    const hold = seg.hold ?? 0;

    this._events?.emit('anticipation:segment', {
      reelIndex: this._reelIndex,
      index: this._segmentIndex,
      total: this._segments.length,
      speed: seg.speed,
      targetSpeed: target,
    });

    const afterRamp = (): void => {
      if (reel.hasDrive) this._warnIfDriveMissedBudget(seg, target);
      // A travel-anchored tease holds its FINAL leg until the odometer says so;
      // the scripted time is the backstop for a reel that stops moving. The
      // mark is taken here, not at `onEnter`, so the count is "cells during the
      // final leg" rather than "cells since the tease began" - the latter lets
      // a surge leg burn the whole budget before the crawl ever starts.
      if (isLast && this._cells != null) {
        this._travelMark = reel.travelledCells;
        this._travelArmed = true;
        this._awaitTravel(Math.max(hold, this._backstopMs));
        return;
      }
      if (hold > 0) {
        this._holdFor(hold, () => this._advance());
      } else {
        this._advance();
      }
    };

    if (reel.hasDrive) {
      reel.targetSpeed = target;
      // Under a drive the segment duration is the time budget for the leg, not
      // a tween length: the drive decides how fast it can actually get there.
      this._holdFor(seg.duration, afterRamp);
      return;
    }

    this._tween = reel.gsap.timeline();
    this._tween.to(reel, {
      speed: target,
      duration: seg.duration / 1000,
      ease: seg.ease ?? DEFAULT_CURVE_EASE,
      onComplete: afterRamp,
    });
  }

  /**
   * A drive that could not reach a segment's speed inside the segment's time
   * budget plays a DIFFERENT tease from the one that was written, and the next
   * leg's retarget hides the evidence. Say so once rather than letting the
   * tween and drive models silently disagree on identical config.
   */
  private _warnIfDriveMissedBudget(seg: AnticipationSegment, target: number): void {
    const gap = Math.abs(this._reel.speed - target);
    if (gap <= DRIVE_ARRIVAL_EPS) return;
    const needed = (gap / Math.max(seg.duration, 1)) * 1000;
    noticeWarnOnce(
      'anticipation-drive-budget',
      `an anticipation segment asked for speed ${seg.speed}x (${target.toFixed(1)} px/frame) ` +
        `within ${seg.duration}ms, but the drive only reached ${this._reel.speed.toFixed(1)}. ` +
        `Raise the segment duration, or loosen the drive (about ${needed.toFixed(2)} px/frame^2 ` +
        'of acceleration would be needed here).',
    );
  }

  private _advance(): void {
    this._segmentIndex++;
    this._runSegment();
  }

  /** GSAP-driven wait, so a hidden tab pauses the tease with everything else. */
  private _holdFor(ms: number, done: () => void): void {
    if (ms <= 0) {
      done();
      return;
    }
    this._delayed = this._reel.gsap.delayedCall(ms / 1000, () => {
      this._delayed = null;
      done();
    });
  }

  /**
   * Hold until the reel has covered `_cells` pitches since the final leg
   * began. `update` does the watching; `backstopMs` is the ceiling that keeps a
   * reel which stopped moving from hanging the spin forever.
   */
  private _awaitTravel(backstopMs: number): void {
    this._holdFor(Math.max(backstopMs, 1), () => this._complete());
  }

  update(_deltaMs: number): void {
    if (!this._travelArmed || this._cells == null || !this._isActive) return;
    if (this._reel.travelledCells - this._travelMark >= this._cells) {
      this._kill();
      this._complete();
    }
  }

  protected onSkip(): void {
    this._kill();
    this._reel.forceSpeed(this._speed.spinSpeed);
  }

  private _kill(): void {
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
    if (this._delayed) {
      this._delayed.kill();
      this._delayed = null;
    }
  }
}
