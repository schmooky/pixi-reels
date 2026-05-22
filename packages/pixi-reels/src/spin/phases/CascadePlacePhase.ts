import type { gsap } from 'gsap';
import { getGsap } from '../../utils/gsapRef.js';
import { ReelPhase } from './ReelPhase.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';
import type { EventEmitter } from '../../events/EventEmitter.js';
import type { ReelSetEvents } from '../../events/ReelEvents.js';
import { computeDropOffsets } from '../../cascade/tumbleAlgorithm.js';

export interface CascadePlacePhaseConfig {
  /** Full target frame for this reel: buffer-above + visible + buffer-below. */
  targetFrame: string[];
  /** Visible rows whose old symbols were "winners" cleared since the last
   *  placement. Empty AND `initial: false` ⇒ no movement on this reel. */
  winnerRows: number[];
  /** `true` for Moment A (initial spin); `false` for Moment B (refill). */
  initial: boolean;
  /** Per-reel delay before placement, in ms. */
  delay?: number;
  /** Reel-set event bus, injected by SpinController. */
  events: EventEmitter<ReelSetEvents>;
}

/**
 * Identity-swap half of the tumble cascade. Runs after `CascadeFallPhase`
 * (Moment A) or right at the start of `refill()` (Moment B).
 *
 * Mechanically tiny: it calls `reel.placeSymbols(visible)` to swap visible
 * symbol identities, then fires `cascade:place:end`. Listeners on that
 * event (badges, decorations, multiplier overlays) run synchronously
 * BEFORE `CascadeDropInPhase` starts the drop tweens. so anything you
 * attach to a new symbol falls WITH it, not after landing.
 */
export class CascadePlacePhase extends ReelPhase<CascadePlacePhaseConfig> {
  readonly name = 'cascade:place';
  readonly skippable = true;

  private _config: CascadePlacePhaseConfig | null = null;
  private _delayedCall: gsap.core.Tween | null = null;

  protected onEnter(config: CascadePlacePhaseConfig): void {
    this._config = config;
    const delaySec = (config.delay ?? 0) / 1000;
    if (delaySec > 0) {
      this._delayedCall = getGsap().delayedCall(delaySec, () => this._doPlace());
    } else {
      this._doPlace();
    }
  }

  private _doPlace(): void {
    this._delayedCall = null;
    if (!this._config) return;

    const reel = this._reel;
    const { targetFrame, events } = this._config;
    const visible = targetFrame.slice(
      reel.bufferAbove,
      reel.bufferAbove + reel.visibleRows,
    );

    reel.placeSymbols(visible);
    // Defensive: CascadeFallPhase displaces views by `fallDistance` and pool
    // reuse can leak the post-fall y onto same-id replacements when
    // `_placeSymbolView` runs BEFORE the motion snap inside placeSymbols.
    // Calling snapToGrid here guarantees every view sits at its grid Y
    // before listeners on `cascade:place:end` (or CascadeDropInPhase) read
    // them.
    reel.snapToGrid();
    reel.notifySpinEnd();

    // Visibility split: SURVIVORS (offsetRows === 0) become visible
    // immediately at grid Y; MOVERS stay at alpha=0 so they don't flash
    // at grid Y for a frame between PlacePhase and CascadeDropInPhase
    // moving them above the viewport. The DropIn phase reveals movers
    // AFTER repositioning view.y, which produces a seamless drop-in.
    const offsets = computeDropOffsets(
      reel.visibleRows,
      this._config.winnerRows,
      { initial: this._config.initial },
    );
    const placedSymbols: ReelSymbol[] = [];
    for (const off of offsets) {
      const sym = reel.getSymbolAt(off.row);
      sym.view.visible = true;
      sym.view.alpha = off.offsetRows === 0 ? 1 : 0;
      placedSymbols.push(sym);
    }

    events.emit('cascade:place:end', {
      reelIndex: reel.reelIndex,
      placedSymbols,
      isInitial: this._config.initial,
      winnerRows: this._config.winnerRows,
    });

    this._complete();
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    if (this._delayedCall) {
      this._delayedCall.kill();
      this._delayedCall = null;
    }
    // If skipped before placement, force the placement so the reel lands
    // on the right identities AND every visible view is fully revealed
    // (skip == "show me the final landed state right now").
    if (this._config) {
      const reel = this._reel;
      const visible = this._config.targetFrame.slice(
        reel.bufferAbove,
        reel.bufferAbove + reel.visibleRows,
      );
      reel.placeSymbols(visible);
      for (let row = 0; row < reel.visibleRows; row++) {
        const view = reel.getSymbolAt(row).view;
        view.alpha = 1;
        view.visible = true;
      }
    }
  }
}
