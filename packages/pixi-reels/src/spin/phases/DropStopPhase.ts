import { gsap } from 'gsap';
import type { Container } from 'pixi.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import type { CascadeDropConfig } from '../../cascade/DropRecipes.js';

export interface DropStopPhaseConfig {
  /** Full frame including buffers (top-to-bottom). */
  targetFrame: string[];
  /** Delay before this reel's symbols drop IN. Fall-out always starts immediately. */
  delay?: number;
}

/**
 * Drop-in stop phase for cascade slot mechanics.
 *
 * Two-stage animation per column:
 *   1. Fall-out — current symbols accelerate downward out of the viewport.
 *   2. Drop-in  — new symbols fall in from above, row by row, with bounce.
 *
 * placeSymbols() is called only after the fall completes, so old and new
 * views are never the same object mid-animation (avoids pool identity conflicts).
 *
 * The cascade config is baked in at construction by ReelSetBuilder.cascade().
 * The per-spin config only carries targetFrame + delay, matching StopPhaseConfig
 * so SpinController needs no changes.
 */
export class DropStopPhase extends ReelPhase<DropStopPhaseConfig> {
  readonly name = 'stop';
  readonly skippable = true;

  private readonly _dropConfig: CascadeDropConfig;
  private _runConfig: DropStopPhaseConfig | null = null;
  private _delayTween: gsap.core.Tween | null = null;
  private _fallTween: gsap.core.Timeline | null = null;
  private _dropTween: gsap.core.Timeline | null = null;
  private _stage: 'falling' | 'waiting' | 'dropping' | 'done' = 'falling';
  /** Views of the symbols that are currently falling out. Used by onSkip to hide them. */
  private _fallingViews: Container[] = [];

  constructor(reel: Reel, speed: SpeedProfile, dropConfig: CascadeDropConfig) {
    super(reel, speed);
    this._dropConfig = dropConfig;
  }

  protected onEnter(config: DropStopPhaseConfig): void {
    this._runConfig = config;
    this._stage = 'falling';
    this._beginFall();
  }

  private _beginFall(): void {
    this._delayTween = null;

    const reel = this._reel;
    const { fromY, fallDuration = 300, fallRowDelay = 0 } = this._dropConfig;
    const cellHeight = reel.motion.slotHeight;
    const visibleRows = reel.visibleRows;
    const dropFromY = fromY ?? cellHeight * (visibleRows + reel.bufferAbove);
    const fallSec = fallDuration / 1000;
    const fallRowDelaySec = fallRowDelay / 1000;

    // Capture current visible symbol views BEFORE placeSymbols swaps identities.
    const views = Array.from({ length: visibleRows }, (_, i) => reel.getSymbolAt(i).view);
    const startYs = views.map((v) => v.y);
    this._fallingViews = views;
    this._stage = 'falling';

    if (fallSec <= 0) {
      this._beginDropIn(dropFromY);
      return;
    }

    this._fallTween = gsap.timeline({
      onComplete: () => {
        this._fallTween = null;
        views.forEach((v) => { v.alpha = 0; });
        this._fallingViews = [];
        const dropInDelay = (this._runConfig?.delay ?? 0) / 1000;
        if (dropInDelay > 0) {
          this._stage = 'waiting';
          this._delayTween = gsap.delayedCall(dropInDelay, () => this._beginDropIn(dropFromY));
        } else {
          this._beginDropIn(dropFromY);
        }
      },
    });

    // Stagger rows by fallRowDelay (symmetric with rowDelay for drop-in)
    views.forEach((v, i) => {
      this._fallTween!.to(v, { y: startYs[i] + dropFromY, duration: fallSec, ease: 'power2.in' }, i * fallRowDelaySec);
    });
  }

  private _beginDropIn(dropFromY: number): void {
    this._stage = 'dropping';

    const reel = this._reel;
    const { rowDelay = 0, easing = 'bounce.out', dropDuration = 600 } = this._dropConfig;
    const bufferAbove = reel.bufferAbove;
    const visibleRows = reel.visibleRows;
    const rowDelaySec = rowDelay / 1000;
    const dropSec = dropDuration / 1000;

    // Place new symbols — snapToGrid is called internally by placeSymbols
    reel.placeSymbols(this._runConfig!.targetFrame.slice(bufferAbove, bufferAbove + visibleRows));
    reel.notifySpinEnd();

    const newViews = Array.from({ length: visibleRows }, (_, i) => reel.getSymbolAt(i).view);
    const finalYs = newViews.map((v) => v.y);

    // Start new symbols above the viewport
    newViews.forEach((v) => { v.y -= dropFromY; });

    if (dropSec <= 0) {
      newViews.forEach((v, i) => { v.y = finalYs[i]; });
      this._stage = 'done';
      reel.notifyLanded();
      this._complete();
      return;
    }

    this._dropTween = gsap.timeline({
      onComplete: () => {
        this._stage = 'done';
        reel.notifyLanded();
        this._complete();
      },
    });

    newViews.forEach((v, rowIndex) => {
      this._dropTween!.to(
        v,
        { y: finalYs[rowIndex], duration: dropSec, ease: easing },
        rowIndex * rowDelaySec,
      );
    });
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    this._killTweens();

    // If falling out, hide those orphaned views so they don't show at mid-fall position
    this._fallingViews.forEach((v) => { v.alpha = 0; });
    this._fallingViews = [];

    const reel = this._reel;
    const config = this._runConfig;

    if (config && this._stage !== 'done') {
      const bufferAbove = reel.bufferAbove;
      const visibleRows = reel.visibleRows;
      reel.placeSymbols(config.targetFrame.slice(bufferAbove, bufferAbove + visibleRows));
    }

    reel.notifySpinEnd();
    reel.notifyLanded();
    this._stage = 'done';
  }

  private _killTweens(): void {
    this._delayTween?.kill();
    this._delayTween = null;
    this._fallTween?.kill();
    this._fallTween = null;
    this._dropTween?.kill();
    this._dropTween = null;
  }
}
