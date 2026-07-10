import type { gsap } from 'gsap';
import { getGsap } from '../../utils/gsapRef.js';
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
    this._baseY = this._reel.container.y;

    const delay = (config.delay ?? 0) / 1000;
    if (delay > 0) {
      this._delayTween = getGsap().delayedCall(delay, () => this._beginSpinOut());
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
    if (this._config.preserveSpeed) {
      // Following an anticipation tease: keep the current (slow) speed so the
      // reel crawls its target frame into place and stops exactly there,
      // rather than re-accelerating to full speed. Floor it so a near-zero
      // anticipation speed can't stall the spin-out forever.
      reel.speed = Math.max(reel.speed, speed.spinSpeed * 0.08);
    } else {
      // Restore full spin speed. anticipation or other phases may have lowered
      // it. The full momentum carries through the final frame placement.
      reel.speed = speed.spinSpeed;
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
    this._bounceTween = getGsap().timeline();
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
      // Place the FULL target frame, not just the visible window — slicing to
      // [bufferAbove, bufferAbove+visible] dropped buffer-above/below targets
      // (e.g. a big symbol's tail parked in bufferAbove), so a direct skip()
      // landed the wrong frame. targetFrame is a flat top-to-bottom strip;
      // placeSymbols reads buffer-above from NEGATIVE indices and visible +
      // buffer-below from positive indices, so convert before placing.
      const bufferAbove = reel.bufferAbove;
      const frame = this._config.targetFrame;
      const placeForm = frame.slice(bufferAbove);
      for (let j = 0; j < bufferAbove; j++) {
        (placeForm as Record<number, string>)[j - bufferAbove] = frame[j];
      }
      reel.placeSymbols(placeForm);
    }
    reel.snapToGrid();
    reel.container.y = this._baseY;
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
