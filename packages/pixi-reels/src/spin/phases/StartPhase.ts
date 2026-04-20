import { gsap } from 'gsap';
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
    const speed = this._speed;
    const delay = config.delay ?? 0;

    reel.spinningMode = config.spinningMode;
    reel.speed = 0;

    if (delay > 0) {
      this._delayedCall = gsap.delayedCall(delay / 1000, () => this._launch());
    } else {
      this._launch();
    }
  }

  private _launch(): void {
    this._delayedCall = null;
    const reel = this._reel;
    const speed = this._speed;
    const accelDuration = (speed.accelerationDuration ?? 300) / 1000;
    const accelEase = speed.accelerationEase ?? 'power2.in';

    this._tween = gsap.timeline();

    // Step-back: brief reverse to give a "pull" before launch.
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

  update(_deltaMs: number): void {
    // Motion is driven by reel.speed, updated by Reel.update()
  }

  protected onSkip(): void {
    this._kill();
    this._reel.speed = this._speed.spinSpeed;
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
