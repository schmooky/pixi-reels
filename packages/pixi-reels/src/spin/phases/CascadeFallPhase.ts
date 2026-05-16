import type { gsap } from 'gsap';
import type { Container } from 'pixi.js';
import { getGsap } from '../../utils/gsapRef.js';
import { ReelPhase } from './ReelPhase.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { SpinningMode } from '../modes/SpinningMode.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';
import type { EventEmitter } from '../../events/EventEmitter.js';
import type { ReelSetEvents } from '../../events/ReelEvents.js';
import type { TumbleFallConfig } from '../../cascade/TumbleConfig.js';

export interface CascadeFallPhaseConfig {
  /** Required by the start-phase contract — set on the reel even though
   *  tumble mode never accelerates. */
  spinningMode: SpinningMode;
  /** Per-reel delay before this column begins its fall, in ms. */
  delay?: number;
  /** Reel-set event bus, injected by SpinController so the phase can emit
   *  `cascade:fall:*` events. */
  events: EventEmitter<ReelSetEvents>;
}

/**
 * Fall-out half of the tumble cascade. Replaces `StartPhase` when the
 * builder was configured with `.tumble(...)`.
 *
 * Runs at the moment the player presses spin: every currently-visible
 * symbol falls off the bottom of the viewport. The reel then sits at speed
 * zero while `SpinPhase` waits for the server result.
 *
 * Animation parameters (duration, ease, row stagger) are baked into the
 * phase at builder time via the factory closure; the run-time config
 * carries only per-spin context (delay, event bus).
 */
export class CascadeFallPhase extends ReelPhase<CascadeFallPhaseConfig> {
  readonly name = 'cascade:fall';
  readonly skippable = true;

  private readonly _fall: Required<TumbleFallConfig>;
  private _timeline: gsap.core.Timeline | null = null;
  private _delayedCall: gsap.core.Tween | null = null;
  /** Views actively being faded out. Tracked so `onSkip` can hide them
   *  rather than leaving them at mid-fall position. */
  private _fallingViews: Container[] = [];

  constructor(reel: Reel, speed: SpeedProfile, fall: Required<TumbleFallConfig>) {
    super(reel, speed);
    this._fall = fall;
  }

  protected onEnter(config: CascadeFallPhaseConfig): void {
    const reel = this._reel;
    reel.spinningMode = config.spinningMode;
    reel.speed = 0;
    reel.notifySpinStart();

    const delaySec = (config.delay ?? 0) / 1000;
    if (delaySec > 0) {
      this._delayedCall = getGsap().delayedCall(delaySec, () => this._beginFall(config.events));
    } else {
      this._beginFall(config.events);
    }
  }

  private _beginFall(events: EventEmitter<ReelSetEvents>): void {
    this._delayedCall = null;

    const reel = this._reel;
    const cellHeight = reel.motion.slotHeight;
    const visibleRows = reel.visibleRows;
    const reelIndex = reel.reelIndex;

    // Distance: just past the bottom buffer so the symbols clear the mask.
    const fallDistance = (visibleRows + reel.bufferBelow + 1) * cellHeight;

    const fallSec = this._fall.duration / 1000;
    const staggerSec = this._fall.rowStagger / 1000;

    // Snapshot views and current Ys before any tween starts. Avoids reading
    // mid-tween Y values if `cascade:fall:symbol` listeners mutate things.
    const symbols: ReelSymbol[] = [];
    const views: Container[] = [];
    const startYs: number[] = [];
    for (let row = 0; row < visibleRows; row++) {
      const sym = reel.getSymbolAt(row);
      symbols.push(sym);
      views.push(sym.view);
      startYs.push(sym.view.y);
    }
    this._fallingViews = views;

    events.emit('cascade:fall:start', { reelIndex });

    if (fallSec <= 0) {
      // Instant fall: hide and complete.
      for (const v of views) v.alpha = 0;
      events.emit('cascade:fall:end', { reelIndex });
      this._fallingViews = [];
      this._complete();
      return;
    }

    const tl = getGsap().timeline({
      onComplete: () => {
        this._timeline = null;
        for (const v of views) v.alpha = 0;
        this._fallingViews = [];
        events.emit('cascade:fall:end', { reelIndex });
        this._complete();
      },
    });
    this._timeline = tl;

    const reverseOrder = this._fall.rowOrder === 'bottomToTop';

    for (let row = 0; row < visibleRows; row++) {
      const view = views[row];
      const symbol = symbols[row];
      const startY = startYs[row];
      const orderIndex = reverseOrder ? visibleRows - 1 - row : row;
      const offset = orderIndex * staggerSec;

      // Fire the per-symbol event right before the tween starts so listeners
      // can stage parallel tweens with full knowledge of duration/ease.
      tl.call(
        () => events.emit('cascade:fall:symbol', {
          symbol,
          view,
          reelIndex,
          rowIndex: row,
          duration: this._fall.duration,
          ease: this._fall.ease,
          distance: fallDistance,
        }),
        undefined,
        offset,
      );

      tl.to(view, {
        y: startY + fallDistance,
        duration: fallSec,
        ease: this._fall.ease,
      }, offset);
    }
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    this._kill();
    for (const v of this._fallingViews) v.alpha = 0;
    this._fallingViews = [];
  }

  private _kill(): void {
    if (this._delayedCall) {
      this._delayedCall.kill();
      this._delayedCall = null;
    }
    if (this._timeline) {
      this._timeline.kill();
      this._timeline = null;
    }
  }
}
