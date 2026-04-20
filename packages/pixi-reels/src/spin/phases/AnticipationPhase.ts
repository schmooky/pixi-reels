import { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';

export interface AnticipationPhaseConfig {
  /** Duration override in ms. Uses speed profile anticipationDelay if not set. */
  duration?: number;
  /** Speed multiplier during anticipation. Default: 0.3 (30% of spin speed). */
  speedMultiplier?: number;
}

/**
 * Anticipation phase: slow-down tease before a reel stops.
 *
 * Decelerates to a fraction of spin speed, holds for a duration, then hands
 * off to StopPhase. StopPhase resets speed to full spin speed at the start
 * of its spin-out stage, so leaving speed low here is fine.
 */
export class AnticipationPhase extends ReelPhase<AnticipationPhaseConfig> {
  readonly name = 'anticipation';
  readonly skippable = true;

  private _tween: gsap.core.Timeline | null = null;

  protected onEnter(config: AnticipationPhaseConfig): void {
    const reel = this._reel;
    const speed = this._speed;
    const duration = (config.duration ?? speed.anticipationDelay) / 1000;
    const targetSpeed = speed.spinSpeed * (config.speedMultiplier ?? 0.3);

    if (duration <= 0) {
      this._complete();
      return;
    }

    this._tween = gsap.timeline();

    this._tween.to(reel, {
      speed: targetSpeed,
      duration: duration * 0.35,
      ease: 'power2.out',
    });
    this._tween.to({}, { duration: duration * 0.65, onComplete: () => this._complete() });
  }

  update(_deltaMs: number): void {
    // Driven by GSAP tweens
  }

  protected onSkip(): void {
    this._kill();
    this._reel.speed = this._speed.spinSpeed;
  }

  private _kill(): void {
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
  }
}
