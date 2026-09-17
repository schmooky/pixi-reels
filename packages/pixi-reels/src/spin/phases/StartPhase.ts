import type { gsap } from 'gsap';
import type { SkipContext } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import { runMove } from './moves.js';
import type { AccelerateMoveContext, PullMoveContext, RunningMove } from './moves.js';
import type { SpinningMode } from '../modes/SpinningMode.js';

export interface StartPhaseConfig {
  /** Spinning mode to set on enter. */
  spinningMode: SpinningMode;
  /** Delay before this reel starts (for staggered start). */
  delay?: number;
}

/** The step-back pull, px/frame backwards and for how long. */
const PULL_SPEED = -2;
const PULL_MS = 50;

/**
 * Accelerates the reel from rest to full spin speed.
 *
 * Optionally performs a brief step-back (reel reverses a tiny amount) before
 * accelerating upward, giving the classic slot machine "pull" feel.
 *
 * Under the tween model both beats are moves (`start.pull`, `start.accelerate`,
 * see `builder.moves()`); under the drive model the ramp belongs to the
 * drive's acceleration bounds and the phase only names destinations.
 */
export class StartPhase extends ReelPhase<StartPhaseConfig> {
  readonly name = 'start';
  readonly skippable = true;

  protected _move: RunningMove | null = null;
  protected _delayedCall: gsap.core.Tween | null = null;

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

  protected _launch(): void {
    this._delayedCall = null;
    const reel = this._reel;
    const speed = this._speed;
    // Re-mask any lifted unmask symbols the instant this reel starts to
    // move. notifySpinStart only fires at accel-end, which would leave an
    // unmasked symbol floating above the mask for the whole ramp.
    reel.beginMotion();
    const accelDuration = speed.accelerationDuration ?? 300;
    const accelEase = speed.accelerationEase ?? 'power2.in';

    if (reel.hasDrive) {
      // Under the drive model the ramp shape belongs to the acceleration
      // bounds, not to this ease. The phase only names the destination and
      // gives the drive the same time budget the tween would have had.
      this._driveLaunch(accelDuration / 1000);
      return;
    }

    const accelerate = (): void => {
      const move = this._moves.start.accelerate;
      const running = runMove<AccelerateMoveContext>(move, {
        reel,
        profile: speed,
        gsap: reel.gsap,
        targetSpeed: speed.spinSpeed,
        duration: accelDuration,
        ease: accelEase,
      });
      this._move = running;
      void running.done.then(() => {
        // Cancelled by a skip: the skip pose owns the reel now.
        if (this._move !== running) return;
        this._move = null;
        // A removed beat is an instant jump to spin speed.
        if (!move) reel.forceSpeed(speed.spinSpeed);
        reel.notifySpinStart();
        this._complete();
      });
    };

    // Step-back: brief reverse to give a "pull" before launch. Only on a
    // profile that bounces, as it always was.
    const pull = this._moves.start.pull;
    if (speed.bounceDistance > 0 && pull) {
      const running = runMove<PullMoveContext>(pull, {
        reel,
        profile: speed,
        gsap: reel.gsap,
        pullSpeed: PULL_SPEED,
        duration: PULL_MS,
      });
      this._move = running;
      void running.done.then(() => {
        if (this._move !== running) return;
        this._move = null;
        accelerate();
      });
      return;
    }
    accelerate();
  }

  /**
   * Drive-model launch: pull back, then ask for full speed and let the
   * acceleration bounds do the ramp. Timed rather than watched for arrival,
   * because a drive tuned slower than `accelerationDuration` would otherwise
   * stretch every spin's start.
   */
  protected _driveLaunch(accelDuration: number): void {
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
      reel.targetSpeed = PULL_SPEED;
      this._delayedCall = reel.gsap.delayedCall(PULL_MS / 1000, finish);
    } else {
      finish();
    }
  }

  update(_deltaMs: number): void {
    // Motion is driven by reel.speed, updated by Reel.update()
  }

  /**
   * Both modes end the same way: at full spin speed, with the spin announced.
   * The pose IS the natural end, so a `'quicken'` completes here as well.
   */
  protected onSkip(ctx: SkipContext = { mode: 'slam' }): void {
    this._kill();
    this._reel.forceSpeed(this._speed.spinSpeed);
    // The accel move died with _kill() before its completion could fire
    // notifySpinStart, but the reel keeps spinning through StopPhase.
    // symbols must still learn they're in a spin (blur / static-spin
    // presentations). Safe if it already fired: the hook is idempotent.
    this._reel.notifySpinStart();
    if (ctx.mode === 'quicken') this._complete();
  }

  protected _kill(): void {
    if (this._delayedCall) {
      this._delayedCall.kill();
      this._delayedCall = null;
    }
    if (this._move) {
      const move = this._move;
      this._move = null;
      move.cancel();
    }
  }
}
