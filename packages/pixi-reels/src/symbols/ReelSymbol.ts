import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import { getGsap } from '../utils/gsapRef.js';

/**
 * One visible cell on a reel. the thing that actually draws.
 *
 * `ReelSymbol` is the abstract base class. Subclass it to pick a rendering
 * technology (`SpriteSymbol`, `AnimatedSpriteSymbol`, `SpineSymbol`, or a
 * custom class of your own). The reel set pools instances aggressively:
 * one instance is reused many times as it scrolls off one identity and on
 * to another, so implementations must never assume "I was just created".
 *
 * Required lifecycle hooks:
 *
 *   - `onActivate(symbolId)`. the pool just handed me a new identity. Swap
 *     texture, restart animations, bring myself out of any "ended" pose.
 *   - `onDeactivate()`. I am about to be pooled. Pause animations, clear
 *     listeners, leave myself in a clean state for the next activation.
 *   - `playWin()`. the spotlight is celebrating me. Return a promise that
 *     resolves when the one-shot animation is done.
 *   - `stopAnimation()`. spotlight is over, return to idle.
 *   - `resize(w, h)`. the reel's cell size changed (on every symbol swap).
 *     Store the dimensions and reposition internal children. Forgetting
 *     this is the single most common "why do my symbols scatter" bug.
 *
 * ```
 * create → activate(symbolId) → [playWin / stopAnimation]
 *                             → deactivate
 *                             → activate(newId) → ...
 * ```
 *
 * There's no hidden GC. Hold resources? Override `onDestroy()`.
 */
export abstract class ReelSymbol implements Disposable {
  /** The PixiJS container that holds this symbol's visual. */
  public readonly view: Container;

  private _symbolId: string = '';
  private _isDestroyed = false;

  constructor() {
    this.view = new Container();
  }

  get symbolId(): string {
    return this._symbolId;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Activate the symbol with a new identity. Called when the symbol enters
   * the visible reel or is recycled from the pool. Resets container
   * transform / filter state for parity with deactivate().
   */
  activate(symbolId: string): void {
    this._symbolId = symbolId;
    this.view.visible = true;
    this.view.alpha = 1;
    this.view.scale.set(1, 1);
    this.view.rotation = 0;
    this.view.filters = null;
    this.view.zIndex = 0;
    this.onActivate(symbolId);
  }

  /**
   * Deactivate the symbol before returning it to the pool. Stops
   * animations, hides the view, and resets container transform / filter
   * state so subclass decorations don't leak across recycles.
   */
  deactivate(): void {
    this.stopAnimation();
    this.onDeactivate();
    this._symbolId = '';
    this.view.visible = false;
    this.view.alpha = 1;
    this.view.scale.set(1, 1);
    this.view.rotation = 0;
    this.view.filters = null;
    this.view.zIndex = 0;
  }

  /** Pool reset. aliases deactivate. */
  reset(): void {
    this.deactivate();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this.stopAnimation();
    this.onDeactivate();
    this.onDestroy();
    if (!this.view.destroyed) this.view.destroy({ children: true });
    this._isDestroyed = true;
  }

  /** Subclass hook: set up visuals for the given symbolId. */
  protected abstract onActivate(symbolId: string): void;

  /** Subclass hook: clean up visuals. */
  protected abstract onDeactivate(): void;

  /** Subclass hook: additional cleanup on destroy. */
  protected onDestroy(): void {
    // Override if needed
  }

  /** Play the win/highlight animation for this symbol. Resolves when complete. */
  abstract playWin(): Promise<void>;

  /** Immediately stop any running animation and return to idle. */
  abstract stopAnimation(): void;

  /** Resize the symbol's visual to fit the given dimensions. */
  abstract resize(width: number, height: number): void;

  /**
   * Play the cascade-destruction animation for this symbol. Called by
   * consumers (typically via `reelSet.destroySymbols(...)`) to disintegrate
   * a winning cell before the next cascade refill drops fresh symbols in.
   *
   * Default implementation: brief scale-up "charge" then implode (scale 0
   * + spin + fade), squishing around the symbol's bounding-box CENTER
   * regardless of the view's anchor. Total ~320 ms. The view is left at
   * `alpha: 0` (destroyed); position / pivot are restored so pool reuse
   * via `_replaceSymbol`'s same-id fast path doesn't inherit a stale
   * pivot offset.
   *
   * Override in subclasses for art-appropriate destruction. e.g. a
   * Spine symbol can play its `disintegration` track here, or a sprite
   * symbol can swap to a shatter atlas. The promise must resolve when
   * the symbol is no longer visible.
   *
   * Default animation: a snappy "poof". tiny anticipation pop (~60 ms)
   * then a fast implode to `scale: 0` + `alpha: 0` (~140 ms), centered on
   * the symbol's bounds. ~200 ms total. No rotation. designed to read
   * cleanly under win-cluster pacing without competing with the win
   * presenter.
   *
   * `opts.delay`. seconds to wait before the animation starts. Use to
   * stagger a cluster of winners (e.g. `i * 0.015`).
   * `opts.signal`. abort signal. If aborted (now or mid-animation), the
   * tween is killed and the view is snapped to its destroyed pose
   * (`alpha: 0`, transform restored). The promise resolves normally. abort
   * means "skip to the end," not "fail". Subclasses that override this
   * method MUST honor the signal or document why they can't (e.g. a Spine
   * `disintegration` track is uninterruptible).
   */
  async playDestroy(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    const view = this.view;
    // Capture original transform so pool reuse sees a clean state.
    const originalPivotX = view.pivot.x;
    const originalPivotY = view.pivot.y;
    const originalX = view.x;
    const originalY = view.y;

    // Pivot to bounds-center so the scale collapses around the visual
    // centre instead of the view's (0,0) corner. and compensate position
    // so the symbol doesn't visibly jump when the pivot moves.
    const bounds = view.getLocalBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    view.pivot.set(cx, cy);
    view.x = originalX + (cx - originalPivotX);
    view.y = originalY + (cy - originalPivotY);

    const delay = opts?.delay ?? 0;
    const signal = opts?.signal;

    const snapDestroyed = (): void => {
      view.alpha = 0;
      view.scale.set(0, 0);
    };

    // Pre-abort: skip the tween entirely and snap to the destroyed pose.
    if (signal?.aborted) {
      snapDestroyed();
      view.pivot.set(originalPivotX, originalPivotY);
      view.x = originalX;
      view.y = originalY;
      view.scale.set(1, 1);
      view.alpha = 0;
      return;
    }

    await new Promise<void>((resolve) => {
      const tl = getGsap()
        .timeline({ onComplete: () => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve();
        }, delay })
        // Brief anticipation pop. small upscale, ~60 ms, with overshoot
        // so the implode reads as a release. No rotation.
        .to(view.scale, { x: 1.1, y: 1.1, duration: 0.06, ease: 'back.out(2.5)' })
        // Snap implode. scale -> 0 + alpha -> 0 together, snappy ease-in
        // so the symbol collapses into the cell centre and is gone.
        .to(view.scale, { x: 0, y: 0, duration: 0.14, ease: 'power3.in' }, '<+=0.04')
        .to(view, { alpha: 0, duration: 0.14, ease: 'power3.in' }, '<');

      const onAbort = (): void => {
        tl.kill();
        snapDestroyed();
        resolve();
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });

    // Restore transform. alpha stays 0 (the symbol IS destroyed). Scale
    // restored to 1 so pool reuse via `_replaceSymbol`'s same-id fast path
    // doesn't inherit a stale 0× scale; _replaceSymbol also resets scale
    // explicitly but a defensive restore here makes the destroyed cell
    // observably "ready to be re-skinned" between calls.
    view.pivot.set(originalPivotX, originalPivotY);
    view.x = originalX;
    view.y = originalY;
    view.scale.set(1, 1);
  }

  /**
   * Lifecycle hook: the owning reel has started spinning.
   * Default: no-op. Override (e.g. SpineReelSymbol.autoPlayBlur) to swap to
   * a blur animation automatically.
   */
  onReelSpinStart(): void {}

  /**
   * Lifecycle hook: the owning reel is about to stop (just before bounce).
   * Default: no-op.
   */
  onReelSpinEnd(): void {}

  /**
   * Lifecycle hook: the owning reel has landed on its final symbols.
   * Default: no-op. Override (e.g. SpineReelSymbol.autoPlayLanding) to fire
   * a landing animation concurrently with the bounce.
   */
  onReelLanded(): void {}
}
