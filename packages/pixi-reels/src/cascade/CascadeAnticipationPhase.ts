import { gsap } from 'gsap';
import { ReelPhase } from '../spin/phases/ReelPhase.js';

/**
 * Anticipation phase for cascade drop-in mechanics.
 *
 * The default AnticipationPhase slows a spinning reel — useless when
 * the reel is stationary. This phase shakes the column instead, giving
 * the player a clear "something's about to drop here" signal.
 *
 * Register it to replace the default for cascade games:
 *   builder.phases(f => f.register('anticipation', CascadeAnticipationPhase))
 *
 * Duration is driven by speed.anticipationDelay (same as standard anticipation).
 */
export class CascadeAnticipationPhase extends ReelPhase<void> {
  readonly name = 'anticipation';
  readonly skippable = true;

  private _tween: gsap.core.Tween | null = null;
  private _baseX = 0;

  protected onEnter(): void {
    const duration = this._speed.anticipationDelay / 1000;

    if (duration <= 0) {
      this._complete();
      return;
    }

    this._baseX = this._reel.container.x;

    // ~12 shakes per second; round to fill duration exactly
    const halfPeriod = 0.04;
    const repeats = Math.round(duration / halfPeriod) - 1;

    this._tween = gsap.to(this._reel.container, {
      x: this._baseX + 4,
      duration: halfPeriod,
      ease: 'power1.inOut',
      yoyo: true,
      repeat: repeats,
      onComplete: () => {
        this._reel.container.x = this._baseX;
        this._complete();
      },
    });
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    this._tween?.kill();
    this._tween = null;
    this._reel.container.x = this._baseX;
  }
}
