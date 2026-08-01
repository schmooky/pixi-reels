import type { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';
import type { EventEmitter } from '../../events/EventEmitter.js';
import type { ReelSetEvents } from '../../events/ReelEvents.js';
import { computeDropOffsets } from '../../cascade/tumbleAlgorithm.js';

export interface CascadePlacePhaseConfig {
  /** Full target frame for this reel: buffer-above + visible + buffer-below. */
  targetFrame: string[];
  /** Visible cells whose old symbols were "winners" cleared since the last
   *  placement. Empty AND `initial: false` ⇒ no movement on this reel. */
  winnerCells: number[];
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
      this._delayedCall = this._reel.gsap.delayedCall(delaySec, () => this._doPlace());
    } else {
      this._doPlace();
    }
  }

  /**
   * Trim the positional `targetFrame` (buffer-above … visible … buffer-below)
   * to the head the cascade actually lands: buffer-above plus the visible
   * window. The buffer-above cells matter — a big-symbol anchor can live
   * there (a partial-visibility "tail-visible" block), and dropping it leaves
   * its visible OCCUPIED stub uncovered so the block's visible cell renders
   * empty. Buffer-below cells are deliberately left off the end for
   * `placeStrip` to random-fill: they're masked and never carry a visible
   * anchor.
   */
  private _placement(targetFrame: string[]): string[] {
    return targetFrame.slice(0, this._reel.bufferStart + this._reel.visibleCells);
  }

  private _doPlace(): void {
    this._delayedCall = null;
    if (!this._config) return;

    const reel = this._reel;
    const { targetFrame, events } = this._config;

    // Re-mask lifted unmask views before any placement/geometry work.
    // A pure refill never passes through StartPhase (strip spins) or
    // notifySpinStart (tumble fall), so without this a lifted symbol
    // stays in viewport.unmaskedContainer while the drop-in repositions
    // it above the viewport. rendering its whole approach outside the
    // mask. Same rule as StartPhase._launch; notifyLanded re-lifts once
    // the refill settles. Idempotent.
    reel.beginMotion();

    reel.placeStrip(this._placement(targetFrame));
    // Defensive: CascadeFallPhase displaces views by `fallDistance` and pool
    // reuse can leak the post-fall y onto same-id replacements when
    // `_placeSymbolView` runs BEFORE the motion snap inside placeSymbols.
    // Calling snapToGrid here guarantees every view sits at its grid Y
    // before listeners on `cascade:place:end` (or CascadeDropInPhase) read
    // them.
    reel.snapToGrid();
    reel.notifySpinEnd();

    // Visibility split: SURVIVORS (offsetCells === 0) become visible
    // immediately at grid Y; MOVERS stay at alpha=0 so they don't flash
    // at grid Y for a frame between PlacePhase and CascadeDropInPhase
    // moving them above the viewport. The DropIn phase reveals movers
    // AFTER repositioning view.y, which produces a flash-free drop-in.
    const offsets = computeDropOffsets(
      reel.visibleCells,
      this._config.winnerCells,
      { initial: this._config.initial },
    );
    // Big symbols: every occupied cell of a block resolves to the SAME anchor
    // view. Reveal it ONCE, keyed on the first visible cell of the block
    // (top-to-bottom), so the anchor's alpha reflects whether the BLOCK moves
    // (mover ⇒ 0, stays hidden until the drop-in repositions it). Without the
    // dedup the last occupied cell wins, leaving a mover-anchor at alpha 1 at
    // its grid Y. it flashes fully-formed there for a frame before the drop-in
    // yanks it back up to fall again ("snap then re-drop").
    const placedSymbols: ReelSymbol[] = [];
    const handledAnchors = new Set<number>();
    for (const off of offsets) {
      const anchorCell = reel.getAnchorCell(off.cell);
      if (anchorCell !== off.cell && handledAnchors.has(anchorCell)) continue;
      handledAnchors.add(anchorCell);
      const sym = reel.getSymbolAt(off.cell);
      sym.view.visible = true;
      sym.view.alpha = off.offsetCells === 0 ? 1 : 0;
      placedSymbols.push(sym);
    }

    events.emit('cascade:place:end', {
      reelIndex: reel.reelIndex,
      placedSymbols,
      isInitial: this._config.initial,
      winnerCells: this._config.winnerCells,
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
      reel.placeStrip(this._placement(this._config.targetFrame));
      for (let cell = 0; cell < reel.visibleCells; cell++) {
        const view = reel.getSymbolAt(cell).view;
        view.alpha = 1;
        view.visible = true;
      }
    }
  }
}
