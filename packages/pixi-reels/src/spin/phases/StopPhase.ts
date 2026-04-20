import { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';

export interface StopPhaseConfig {
  /** Target symbols for this reel (full frame including buffers, top-to-bottom). */
  targetFrame: string[];
  /** Delay before this reel starts stopping (for staggered stop). */
  delay?: number;
}

/**
 * Stops the reel on the target frame with a weighted, slot-machine feel.
 *
 * Sequence:
 * 1. Wait for the staggered delay.
 * 2. Keep spinning at full speed with `isStopping` flagged. The target frame
 *    is loaded into the StopSequencer; each wrap event at the top of the
 *    reel pulls the next frame symbol — so targets arrive in the visible
 *    area naturally, carrying the full momentum of the spin.
 * 3. When the sequencer is exhausted, snap to grid and bounce:
 *    - overshoot downward by `bounceDistance` with `power1.out`
 *    - settle back upward with `power1.out`
 *    Both legs share a duration for a symmetric, weighty landing.
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
    this._baseY = this._reel.container.y;

    const delay = (config.delay ?? 0) / 1000;
    if (delay > 0) {
      this._delayTween = gsap.delayedCall(delay, () => this._beginSpinOut());
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
    // Restore full spin speed — anticipation or other phases may have lowered
    // it. Weighty stops need full momentum through the final frame.
    reel.speed = speed.spinSpeed;

    this._stage = 'spinning';
  }

  update(_deltaMs: number): void {
    if (this._stage !== 'spinning') return;
    // Sequencer consumes one symbol per wrap via Reel._onSymbolWrapped.
    // When it's empty, the target frame is fully placed — time to land.
    if (!this._reel.stopSequencer.hasRemaining) {
      this._landAndBounce();
    }
  }

  private _landAndBounce(): void {
    const reel = this._reel;
    const speed = this._speed;

    reel.speed = 0;
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
    this._stage = 'bouncing';
    this._bounceTween = gsap.timeline();
    this._bounceTween.to(reel.container, {
      y: this._baseY + bounceDistance,
      duration: legDuration,
      ease: 'power1.out',
    });
    this._bounceTween.to(reel.container, {
      y: this._baseY,
      duration: legDuration,
      ease: 'power1.out',
      onComplete: () => {
        this._stage = 'done';
        this._complete();
      },
    });
  }

  protected onSkip(): void {
    this._killTweens();
    const reel = this._reel;
    reel.speed = 0;
    reel.isStopping = false;

    if (this._stage !== 'done' && this._config) {
      const bufferAbove = reel.bufferAbove;
      const visible = reel.visibleRows;
      reel.placeSymbols(this._config.targetFrame.slice(bufferAbove, bufferAbove + visible));
    }
    reel.snapToGrid();
    reel.container.y = this._baseY;
    reel.notifySpinEnd();
    reel.notifyLanded();
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
