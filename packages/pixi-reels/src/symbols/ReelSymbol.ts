import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import { getGsap } from '../utils/gsapRef.js';

/**
 * One visible cell on a reel — the thing that actually draws.
 *
 * `ReelSymbol` is the abstract base class. Subclass it to pick a rendering
 * technology (`SpriteSymbol`, `AnimatedSpriteSymbol`, `SpineSymbol`, or a
 * custom class of your own). The reel set pools instances aggressively:
 * one instance is reused many times as it scrolls off one identity and on
 * to another, so implementations must never assume "I was just created".
 *
 * Required lifecycle hooks:
 *
 *   - `onActivate(symbolId)` — the pool just handed me a new identity. Swap
 *     texture, restart animations, bring myself out of any "ended" pose.
 *   - `onDeactivate()` — I am about to be pooled. Pause animations, clear
 *     listeners, leave myself in a clean state for the next activation.
 *   - `playWin()` — the spotlight is celebrating me. Return a promise that
 *     resolves when the one-shot animation is done.
 *   - `stopAnimation()` — spotlight is over, return to idle.
 *   - `resize(w, h)` — the reel's cell size changed (on every symbol swap).
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

  /** Pool reset — aliases deactivate. */
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
   * consumers (typically via a `destroyWinners(reelSet, winners)` helper)
   * to disintegrate a winning cell before the next cascade refill drops
   * fresh symbols in.
   *
   * Default implementation: brief scale-up "charge" then implode (scale 0
   * + spin + fade), squishing around the symbol's bounding-box CENTER
   * regardless of the view's anchor. Total ~320 ms. The view is left at
   * `alpha: 0` (destroyed); position / pivot are restored so pool reuse
   * via `_replaceSymbol`'s same-id fast path doesn't inherit a stale
   * pivot offset.
   *
   * Override in subclasses for art-appropriate destruction — e.g. a
   * Spine symbol can play its `disintegration` track here, or a sprite
   * symbol can swap to a shatter atlas. The promise must resolve when
   * the symbol is no longer visible.
   *
   * `opts.direction` — rotation direction (`1` or `-1`). Default: random.
   * For coherent clusters, callers should pass `w.reel % 2 === 0 ? 1 : -1`
   * (alternate by column) instead of relying on random.
   * `opts.delay` — seconds to wait before the animation starts. Use to
   * stagger a cluster of winners (e.g. `i * 0.015`).
   */
  async playDestroy(opts?: { direction?: 1 | -1; delay?: number }): Promise<void> {
    const view = this.view;
    // Capture original transform so pool reuse sees a clean state.
    const originalPivotX = view.pivot.x;
    const originalPivotY = view.pivot.y;
    const originalX = view.x;
    const originalY = view.y;

    // Pivot to bounds-center so scale + rotation squish around the visual
    // centre instead of the view's (0,0) corner — and compensate position
    // so the symbol doesn't visibly jump when the pivot moves.
    const bounds = view.getLocalBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    view.pivot.set(cx, cy);
    view.x = originalX + (cx - originalPivotX);
    view.y = originalY + (cy - originalPivotY);

    const dir = opts?.direction ?? (Math.random() < 0.5 ? 1 : -1);
    const delay = opts?.delay ?? 0;

    await new Promise<void>((resolve) => {
      getGsap()
        .timeline({ onComplete: () => resolve(), delay })
        // Brief scale-up "charge" so the impending destruction has a beat
        // of anticipation before the implode.
        .to(view.scale, { x: 1.25, y: 1.25, duration: 0.08, ease: 'back.out(2.5)' })
        // Then implode: scale → 0, fade, slight spin.
        .to(view, { rotation: dir * 0.8, alpha: 0, duration: 0.24, ease: 'power2.in' }, '<+=0.05')
        .to(view.scale, { x: 0, y: 0, duration: 0.24, ease: 'power2.in' }, '<');
    });

    // Restore transform — alpha stays 0 (the symbol IS destroyed).
    view.pivot.set(originalPivotX, originalPivotY);
    view.x = originalX;
    view.y = originalY;
    view.rotation = 0;
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
