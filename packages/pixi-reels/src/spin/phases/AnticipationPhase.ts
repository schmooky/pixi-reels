import type { gsap } from 'gsap';
import type { AnticipationSegment } from '../../config/types.js';
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
}

/** Ease for a curve segment that does not name one. See {@link AnticipationSegment.ease}. */
const DEFAULT_CURVE_EASE = 'power2.inOut';

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
 * **Travel anchor.** With `config.cells`, the phase ignores the final hold and
 * ends when the reel has covered that many symbol pitches instead, so the tease
 * is cut to symbols going past the window rather than to a clock. A reel that
 * comes to rest can never reach a travel target, so the scripted time still
 * runs as a backstop.
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

  /** Odometer reading (in cells) when the tease began. Only used with `cells`. */
  private _travelMark = 0;
  /** Travel target in cells, or `null` when this tease is time-anchored. */
  private _cells: number | null = null;
  /** Curve legs still to play, when driving segments by hand. */
  private _segments: AnticipationSegment[] = [];
  private _segmentIndex = 0;
  /**
   * Effective tease hold in ms. Doubles as the backstop for a travel-anchored
   * tease: a reel that comes to rest can never reach a cell target, and a tease
   * that never ends is a hung spin.
   */
  private _backstopMs = 0;

  protected onEnter(config: AnticipationPhaseConfig): void {
    const reel = this._reel;
    const speed = this._speed;
    const duration = (config.duration ?? speed.anticipationDelay) / 1000;

    if (duration <= 0) {
      this._complete();
      return;
    }

    this._cells = config.cells != null && config.cells > 0 ? config.cells : null;
    this._travelMark = reel.travelledCells;
    this._backstopMs = duration * 1000;

    if (config.curve && config.curve.length > 0) {
      this._segments = config.curve;
      this._segmentIndex = 0;
      this._runSegment();
      return;
    }

    const targetSpeed = speed.spinSpeed * (config.speedMultiplier ?? 0.3);
    this._segments = [];

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

    const afterRamp = (): void => {
      // A travel-anchored tease holds until the odometer says so; the scripted
      // hold on the last leg is the backstop for a reel that stops moving.
      if (isLast && this._cells != null) {
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
   * Hold until the reel has covered `_cells` pitches since the tease began.
   * `update` does the watching; `backstopMs` is the ceiling that keeps a reel
   * which stopped moving from hanging the spin forever.
   */
  private _awaitTravel(backstopMs: number): void {
    this._holdFor(Math.max(backstopMs, 1), () => this._complete());
  }

  update(_deltaMs: number): void {
    if (this._cells == null || !this._isActive) return;
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
