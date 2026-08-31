import type { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';

export interface StopPhaseConfig {
  /** Target symbols for this reel (full frame including buffers, top-to-bottom). */
  targetFrame: string[];
  /** Delay before this reel starts stopping (for staggered stop). */
  delay?: number;
  /**
   * Keep the reel's CURRENT speed into the spin-out instead of restoring full
   * spin speed. Set by the controller when this stop follows an anticipation
   * tease, so the reel crawls its target into place at the slow anticipation
   * speed and stops exactly there. rather than snapping back to full speed and
   * doing a fast spin-out. A small floor is applied so a `slowdown.to: 0`
   * curve can't stall the reel.
   */
  preserveSpeed?: boolean;
}

/**
 * Stops the reel on the target frame.
 *
 * Sequence:
 * 1. Wait for the staggered delay.
 * 2. Keep spinning at full speed with `isStopping` flagged. The target frame
 *    is loaded into the StopSequencer; each wrap event at the top of the
 *    reel pulls the next frame symbol. so targets arrive in the visible
 *    area naturally, carrying the full momentum of the spin.
 * 3. When the sequencer is exhausted, snap to grid and bounce:
 *    - overshoot downward by `bounceDistance` with `power1.out`
 *    - settle back upward with `power1.out`
 *    Both legs share a duration so the down + up motion is symmetric.
 */
export class StopPhase extends ReelPhase<StopPhaseConfig> {
  readonly name = 'stop';
  readonly skippable = true;

  private _config: StopPhaseConfig | null = null;
  private _delayTween: gsap.core.Tween | null = null;
  private _bounceTween: gsap.core.Timeline | null = null;
  private _stage: 'delay' | 'spinning' | 'bouncing' | 'done' = 'delay';
  private _baseY = 0;

  protected onEnter(config: StopPhaseConfig): void {
    this._config = config;
    this._stage = 'delay';
    this._baseY = this._reel.axis.getMain(this._reel.container);

    const delay = (config.delay ?? 0) / 1000;
    if (delay > 0) {
      this._delayTween = this._reel.gsap.delayedCall(delay, () => this._beginSpinOut());
    } else {
      this._beginSpinOut();
    }
  }

  private _beginSpinOut(): void {
    if (!this._config) return;
    const reel = this._reel;
    const speed = this._speed;

    reel.setStopFrame(this._config.targetFrame);
    reel.isStopping = true;
    // Under the drive model the reel RAMPS to the spin-out speed inside its
    // acceleration bounds; forcing it would put back exactly the discontinuity
    // the drive exists to remove. Under the tween model there is no ramp to
    // respect and the assignment is immediate, as it always was.
    const setSpeed = reel.hasDrive
      ? (v: number) => {
          reel.targetSpeed = v;
        }
      : (v: number) => reel.forceSpeed(v);

    if (this._config.preserveSpeed) {
      // Following an anticipation tease: keep the current (slow) speed so the
      // reel crawls its target frame into place and stops exactly there,
      // rather than re-accelerating to full speed. Floor it so a near-zero
      // anticipation speed can't stall the spin-out forever, and cap it at full
      // spin speed so a curve that ended on a SURGE segment cannot leak an
      // above-normal speed into the landing.
      setSpeed(Math.min(Math.max(reel.speed, speed.spinSpeed * 0.08), speed.spinSpeed));
      // A surge has to come DOWN before the frame lands, and a drive would take
      // its own sweet time about it. The cap is a correctness rule, not a feel
      // choice, so it applies to the live speed immediately either way.
      if (reel.hasDrive && reel.speed > speed.spinSpeed) reel.speed = speed.spinSpeed;
    } else {
      // Restore full spin speed. anticipation or other phases may have lowered
      // it. The full momentum carries through the final frame placement.
      setSpeed(speed.spinSpeed);
    }

    this._stage = 'spinning';
  }

  update(_deltaMs: number): void {
    if (this._stage !== 'spinning') return;
    // Sequencer consumes one symbol per wrap via Reel._onSymbolWrapped.
    // When it's empty, the target frame is fully placed. time to land.
    if (!this._reel.stopSequencer.hasRemaining) {
      this._landAndBounce();
    }
  }

  private _landAndBounce(): void {
    const reel = this._reel;
    const speed = this._speed;

    // haltDrive, not `speed = 0`: under the drive model a bare zero would be
    // ramped straight back toward the old target on the very next tick.
    reel.haltDrive();
    reel.isStopping = false;
    reel.snapToGrid();
    reel.notifySpinEnd();
    reel.notifyLanded();

    const bounceDistance = speed.bounceDistance;
    if (bounceDistance <= 0) {
      this._stage = 'done';
      this._complete();
      return;
    }

    const legDuration = (speed.bounceDuration ?? 600) / 2000; // half of total, in seconds
    // Overshoot in the direction of travel: forward reels overshoot toward the
    // larger main coordinate, reverse reels toward the smaller. axis.polarity
    // makes this automatic and keeps vertical/forward at `base + bounceDistance`.
    const axis = reel.axis;
    this._stage = 'bouncing';

    // `notifyLanded()` just lifted every at-rest unmask symbol into
    // `viewport.unmaskedContainer`, where the reel offset is baked into the
    // view's own coordinate instead of inherited from `reel.container`. The
    // bounce moves the container, so without this the lifted views hang
    // motionless for the whole overshoot while the reel travels under them.
    let followedMain = this._baseY;
    const followLifted = (): void => {
      const main = axis.getMain(reel.container);
      reel.offsetLiftedViews(main - followedMain);
      followedMain = main;
    };

    this._bounceTween = this._reel.gsap.timeline();
    this._bounceTween.to(reel.container, {
      [axis.mainProp]: this._baseY + axis.polarity * bounceDistance,
      duration: legDuration,
      ease: 'power1.out',
      onUpdate: followLifted,
    });
    this._bounceTween.to(reel.container, {
      [axis.mainProp]: this._baseY,
      duration: legDuration,
      ease: 'power1.out',
      onUpdate: followLifted,
      onComplete: () => {
        // The last onUpdate can land a hair short of the end value; settle the
        // lifted views on the exact resting position rather than that epsilon.
        followLifted();
        this._stage = 'done';
        this._complete();
      },
    });
  }

  protected onSkip(): void {
    this._killTweens();
    const reel = this._reel;
    reel.haltDrive();
    reel.isStopping = false;

    if (this._stage !== 'done' && this._config) {
      // Place the FULL target frame, not just the visible window — slicing to
      // [bufferStart, bufferStart+visible] dropped buffer-above/below targets
      // (e.g. a big symbol's tail parked in bufferStart), so a direct skip()
      // landed the wrong frame. targetFrame is already a flat top-to-bottom
      // strip, which is exactly what placeStrip consumes.
      reel.placeStrip(this._config.targetFrame);
    }
    // Rest the container BEFORE snapping. `snapToGrid` re-bakes the container's
    // current main coordinate into any lifted unmask view, so skipping mid-bounce
    // used to bake the overshoot position and then move the container out from
    // under it, leaving the view off by however far the bounce had travelled.
    reel.axis.setMain(reel.container, this._baseY);
    reel.snapToGrid();
    this._stage = 'done';
  }

  private _killTweens(): void {
    if (this._delayTween) {
      this._delayTween.kill();
      this._delayTween = null;
    }
    if (this._bounceTween) {
      this._bounceTween.kill();
      this._bounceTween = null;
    }
  }
}
