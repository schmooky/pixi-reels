import type { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';
import type { SpinningMode } from '../modes/SpinningMode.js';

export interface StartPhaseConfig {
  /** Spinning mode to set on enter. */
  spinningMode: SpinningMode;
  /** Delay before this reel starts (for staggered start). */
  delay?: number;
}

/**
 * Accelerates the reel from rest to full spin speed.
 *
 * Optionally performs a brief step-back (reel reverses a tiny amount) before
 * accelerating upward, giving the classic slot machine "pull" feel.
 */
export class StartPhase extends ReelPhase<StartPhaseConfig> {
  readonly name = 'start';
  readonly skippable = true;

  private _tween: gsap.core.Timeline | null = null;
  private _delayedCall: gsap.core.Tween | null = null;

  protected onEnter(config: StartPhaseConfig): void {
    const reel = this._reel;
    const delay = config.delay ?? 0;

    reel.spinningMode = config.spinningMode;
    reel.haltDrive();

    if (delay > 0) {
      this._delayedCall = this._reel.gsap.delayedCall(delay / 1000, () => this._launch());
    } else {
      this._launch();
    }
  }

  private _launch(): void {
    this._delayedCall = null;
    const reel = this._reel;
    const speed = this._speed;
    // Re-mask any lifted unmask symbols the instant this reel starts to
    // move. notifySpinStart only fires at accel-end, which would leave an
    // unmasked symbol floating above the mask for the whole ramp.
    reel.beginMotion();
    const accelDuration = (speed.accelerationDuration ?? 300) / 1000;
    const accelEase = speed.accelerationEase ?? 'power2.in';

    if (reel.hasDrive) {
      // Under the drive model the ramp shape belongs to the acceleration
      // bounds, not to this ease. The phase only names the destination and
      // gives the drive the same time budget the tween would have had.
      this._driveLaunch(accelDuration);
      return;
    }

    this._tween = this._reel.gsap.timeline();

    // Step-back: brief reverse to give a "pull" before launch. This tweens
    // reel.speed, not a position, so it needs no axis routing: the negative
    // speed is direction-relative and ReelMotion.advance multiplies travel by
    // axis.polarity, making it read as "backwards for this reel" in any
    // orientation/direction. Multiplying speed by polarity here would instead
    // invert the pull on reverse reels.
    if (speed.bounceDistance > 0) {
      this._tween.to(reel, {
        speed: -2,
        duration: 0.05,
        ease: 'power1.out',
      });
    }

    this._tween.to(reel, {
      speed: speed.spinSpeed,
      duration: accelDuration,
      ease: accelEase,
      onComplete: () => {
        reel.notifySpinStart();
        this._complete();
      },
    });
  }

  /**
   * Drive-model launch: pull back, then ask for full speed and let the
   * acceleration bounds do the ramp. Timed rather than watched for arrival,
   * because a drive tuned slower than `accelerationDuration` would otherwise
   * stretch every spin's start.
   */
  private _driveLaunch(accelDuration: number): void {
    const reel = this._reel;
    const speed = this._speed;
    const finish = (): void => {
      this._delayedCall = null;
      reel.targetSpeed = speed.spinSpeed;
      this._delayedCall = reel.gsap.delayedCall(accelDuration, () => {
        this._delayedCall = null;
        reel.notifySpinStart();
        this._complete();
      });
    };

    if (speed.bounceDistance > 0) {
      reel.targetSpeed = -2;
      this._delayedCall = reel.gsap.delayedCall(0.05, finish);
    } else {
      finish();
    }
  }

  update(_deltaMs: number): void {
    // Motion is driven by reel.speed, updated by Reel.update()
  }

  protected onSkip(): void {
    this._kill();
    this._reel.forceSpeed(this._speed.spinSpeed);
    // The accel tween died with _kill() before its onComplete could fire
    // notifySpinStart, but the reel keeps spinning through StopPhase.
    // symbols must still learn they're in a spin (blur / static-spin
    // presentations). Safe if it already fired: the hook is idempotent.
    this._reel.notifySpinStart();
  }

  private _kill(): void {
    if (this._delayedCall) {
      this._delayedCall.kill();
      this._delayedCall = null;
    }
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
  }
}
