import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { ReelCellInset, ReelCellQuad } from '../config/types.js';
import { DEFAULT_GSAP, type Gsap } from '../utils/gsap.js';

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

  private _gsap: Gsap = DEFAULT_GSAP;
  private _mainAxis: 'x' | 'y' = 'y';

  constructor() {
    this.view = new Container();
  }

  /**
   * The gsap instance this symbol should animate on. Use it instead of
   * importing `gsap` in a subclass: under a symlinked-workspace module
   * resolution your import and the engine's can be different instances, and
   * only this one is on the timeline the reel set actually drives.
   *
   * Bound to the owning set by `SymbolFactory`; falls back to the instance
   * resolved at lib-load time for a symbol built outside a set.
   */
  protected get gsap(): Gsap {
    return this._gsap;
  }

  /**
   * @internal. Called by `SymbolFactory` when the symbol is created, so a
   * pooled symbol animates on its own set's gsap rather than whichever set
   * happened to build last.
   */
  bindGsap(instance: Gsap): void {
    this._gsap = instance;
  }

  /**
   * The screen axis the owning set's strips travel along: `'y'` for a
   * vertical set, `'x'` for a horizontal one.
   *
   * Symbols are otherwise orientation-agnostic - `resize(width, height)` is
   * screen-space and always will be. This exists for the few effects that
   * genuinely follow travel, motion blur being the one in the box.
   */
  protected get mainAxis(): 'x' | 'y' {
    return this._mainAxis;
  }

  /** @internal. Bound by `SymbolFactory` from the set's orientation. */
  bindMainAxis(prop: 'x' | 'y'): void {
    this._mainAxis = prop;
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
  protected onDestroy(): void {}

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
   * Override in subclasses for art-appropriate destruction, e.g. a Spine
   * symbol can play its `disintegration` track here, or a sprite symbol can
   * swap to a shatter atlas. The promise must resolve when the symbol is no
   * longer visible.
   *
   * Default: a snappy "poof" centered on the symbol's bounds regardless of
   * the view's anchor. Tiny anticipation pop (~60 ms) then a fast implode to
   * `scale: 0` + `alpha: 0` (~140 ms), ~200 ms total, no rotation. Reads
   * cleanly under win-cluster pacing without competing with the win
   * presenter. The view is left at `alpha: 0` (destroyed); position / pivot
   * are restored so pool reuse via `_replaceSymbol`'s same-id fast path
   * doesn't inherit a stale pivot offset.
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
    // Moving the pivot moves the view by `delta * scale`, not by `delta`: a
    // container renders a local point at `position + (point - pivot) * scale`.
    // Scale is 1 on a plain reel, which is why dropping it went unnoticed, but
    // a curved reel scales every cell and the symbol would jump on destroy.
    view.pivot.set(cx, cy);
    view.x = originalX + (cx - originalPivotX) * view.scale.x;
    view.y = originalY + (cy - originalPivotY) * view.scale.y;

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
      const tl = this.gsap
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
   * Animate this symbol AWAY, without destroying it.
   *
   * The counterpart to {@link playIn}, and the seam a mystery reveal needs:
   * the cells on screen dissolve, their identities are swapped underneath, and
   * the new ones arrive. `playDestroy` is the cascade's version of the same
   * beat and is deliberately separate - it is tuned as a "this cell was a
   * winner and is being consumed" poof, and a reveal is not that.
   *
   * Leaves the view hidden (`alpha: 0`) with its transform restored, so the
   * caller may swap the identity and call `playIn` next.
   *
   * Override for art-appropriate exits - a Spine symbol plays its own `out`
   * track here. Honour `opts.signal`: abort means "snap to the end", not
   * "fail", so the promise still resolves.
   *
   * Default: a ~180 ms shrink-and-fade with no overshoot, centred on the
   * symbol's bounds rather than the view origin.
   */
  async playOut(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    await this._tweenPresence('out', opts);
  }

  /**
   * Animate this symbol IN, from nothing to its resting pose.
   *
   * Owns its own start pose. A symbol that has just been re-activated is fully
   * visible (`activate()` resets alpha and scale), so an entrance that assumed
   * it started hidden would pop before it animated. This sets the hidden pose
   * first, then plays.
   *
   * Override for art-appropriate entrances - a Spine symbol plays its own `in`
   * track here. Honour `opts.signal`: abort snaps to the RESTING pose (alpha 1,
   * scale 1), because arriving is what the caller asked for.
   *
   * Default: a ~200 ms fade and scale-up with a small overshoot.
   */
  async playIn(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    await this._tweenPresence('in', opts);
  }

  /**
   * Shared body of {@link playIn} / {@link playOut}.
   *
   * One function because the two are the same tween read in opposite
   * directions, and because the fiddly part - pivoting to the visual centre so
   * the scale does not collapse toward the view's (0, 0) corner, and
   * compensating the position for the pivot move - is identical and easy to get
   * subtly wrong twice. Same correction as `playDestroy`: a container renders a
   * local point at `position + (point - pivot) * scale`, so a curved reel (which
   * scales every cell) would make the symbol jump without the `* scale` term.
   */
  private async _tweenPresence(
    direction: 'in' | 'out',
    opts?: { delay?: number; signal?: AbortSignal },
  ): Promise<void> {
    const view = this.view;
    const originalPivotX = view.pivot.x;
    const originalPivotY = view.pivot.y;
    const originalX = view.x;
    const originalY = view.y;

    const bounds = view.getLocalBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    view.pivot.set(cx, cy);
    view.x = originalX + (cx - originalPivotX) * view.scale.x;
    view.y = originalY + (cy - originalPivotY) * view.scale.y;

    const restorePivot = (): void => {
      view.pivot.set(originalPivotX, originalPivotY);
      view.x = originalX;
      view.y = originalY;
    };
    const snapEnd = (): void => {
      if (direction === 'out') {
        view.alpha = 0;
        view.scale.set(1, 1);
      } else {
        view.visible = true;
        view.alpha = 1;
        view.scale.set(1, 1);
      }
    };

    const delay = opts?.delay ?? 0;
    const signal = opts?.signal;

    if (direction === 'in') {
      // Own the start pose: `activate()` leaves a freshly swapped symbol fully
      // visible, so without this the new art is on screen for a frame before
      // the entrance begins.
      view.visible = true;
      view.alpha = 0;
      view.scale.set(0.72, 0.72);
    }

    if (signal?.aborted) {
      snapEnd();
      restorePivot();
      return;
    }

    await new Promise<void>((resolve) => {
      const onAbort = (): void => {
        tl.kill();
        snapEnd();
        resolve();
      };
      const tl = this.gsap.timeline({
        delay,
        onComplete: () => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve();
        },
      });
      if (direction === 'out') {
        tl.to(view.scale, { x: 0.72, y: 0.72, duration: 0.18, ease: 'power2.in' }).to(
          view,
          { alpha: 0, duration: 0.18, ease: 'power2.in' },
          '<',
        );
      } else {
        tl.to(view.scale, { x: 1, y: 1, duration: 0.2, ease: 'back.out(1.7)' }).to(
          view,
          { alpha: 1, duration: 0.16, ease: 'power2.out' },
          '<',
        );
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });

    // Scale back to 1 either way: a hidden symbol still has to be a legal
    // resting pose, or pool reuse inherits the shrunken scale.
    view.scale.set(1, 1);
    restorePivot();
  }

  /**
   * The owning reel is curved: render into this projected quad instead of the
   * flat cell rectangle. `null` means the reel is flat again.
   *
   * The quad's corners are SCREEN-space and local to this view's own origin,
   * clockwise from top-left, and `width` / `height` give the flat cell box the
   * quad replaces. Called on every frame of motion and on every placement, so
   * it must be cheap and idempotent.
   *
   * **The default is an approximation.** A `Container` transform is affine, so
   * it cannot express a trapezoid; the base class fits the quad as closely as
   * an affine transform can - a UNIFORM scale about the quad's centre. Uniform
   * on purpose: symbol art is usually smaller than its cell and has a shape a
   * player recognises, and squashing one axis turns a `7` into a squashed `7`
   * rather than a `7` seen at an angle.
   *
   * Override this to render the real perspective. {@link SpriteSymbol} and
   * {@link AnimatedSpriteSymbol} do, by drawing their texture through a
   * `PerspectiveMesh`, which costs no extra render pass because the content is
   * already a texture. A symbol whose content is an arbitrary subtree (Spine, a
   * composite of sprites and text) cannot do that without rendering itself to a
   * texture every frame, so it keeps the affine fit.
   *
   * Whatever you do here, do NOT move `view.position`: the reel reads that
   * coordinate back to work out which slot this symbol is in.
   */
  /**
   * The part of its cell this symbol's art actually covers, or `null` (the
   * default) for "all of it".
   *
   * Slot art is usually smaller than its cell - a trimmed atlas frame is a
   * shape floating in a much bigger transparent box - and the reel needs to
   * know that to project the rectangle the art is really in. Overriding this
   * is what stops a small symbol being inflated to the cell's edges and given
   * the cell's keystone instead of its own, milder one.
   *
   * Read once per projection, so it may change with the symbol's identity.
   */
  get cellInset(): ReelCellInset | null {
    return null;
  }

  applyCellQuad(quad: ReelCellQuad | null): void {
    const view = this.view;
    if (quad === null) {
      view.scale.set(1, 1);
      view.pivot.set(0, 0);
      return;
    }
    // Measure the trapezoid: the mean of its two parallel edges, and the
    // distance between their midpoints.
    const nearWidth = Math.hypot(quad.x1 - quad.x0, quad.y1 - quad.y0);
    const farWidth = Math.hypot(quad.x2 - quad.x3, quad.y2 - quad.y3);
    const across = (nearWidth + farWidth) / 2;
    const along = Math.hypot(
      (quad.x3 + quad.x2) / 2 - (quad.x0 + quad.x1) / 2,
      (quad.y3 + quad.y2) / 2 - (quad.y0 + quad.y1) / 2,
    );
    // CONTAIN, not cover. A quad in the middle of the window is TALLER than
    // the flat cell (that is the drum magnifying what faces you), so a scale
    // picked to fill it would also make the symbol wider than its column and
    // overlap its neighbours - very visible on art that fills its cell
    // edge-to-edge. Taking the smaller ratio keeps every symbol inside its own
    // projected footprint at the cost of a little slack on one axis.
    const scale =
      quad.width > 0 && quad.height > 0
        ? Math.min(across / quad.width, along / quad.height)
        : 1;

    const cx = (quad.x0 + quad.x1 + quad.x2 + quad.x3) / 4;
    const cy = (quad.y0 + quad.y1 + quad.y2 + quad.y3) / 4;
    view.scale.set(scale, scale);
    // A container renders a local point at `position + (point - pivot) * scale`
    // and `position` must not move, so putting the flat box's centre on the
    // quad's centre has to be paid for entirely out of the pivot.
    view.pivot.set(
      quad.x + quad.width / 2 - cx / scale,
      quad.y + quad.height / 2 - cy / scale,
    );
  }

  /**
   * Lifecycle hook: the owning reel is spinning.
   * Default: no-op. Override (e.g. SpineReelSymbol.autoPlayBlur,
   * StaticSpinSymbol) to swap to a spin presentation automatically.
   *
   * Fired on every strip symbol (visible AND buffer cells) when the reel
   * enters the spin phase, and again with `joinedMidSpin: true` on each
   * symbol freshly installed while the reel is already spinning (pool
   * recycling wipes symbol state, so a wrapped-in symbol can't know the
   * reel is moving without this). Implementations MUST be idempotent.
   * the same instance can be notified more than once per spin.
   *
   * @param joinedMidSpin true when this symbol was installed into a reel
   * already at speed (skip start-of-spin transitions like blur ramps).
   */
  onReelSpinStart(joinedMidSpin?: boolean): void {}

  /**
   * Lifecycle hook: the owning reel is about to stop (just before bounce).
   * Default: no-op.
   */
  onReelSpinEnd(): void {}

  /**
   * Lifecycle hook: the owning reel entered its anticipation (tease) phase.
   * it is still spinning, but slowed enough that the strip is readable.
   * Spin presentations that obscure symbols (blur textures, smear
   * animations) should relax so the player can follow the tease. Also
   * fired on symbols installed while the reel is anticipating.
   * Implementations MUST be idempotent. Default: no-op.
   */
  onReelAnticipationStart(): void {}

  /**
   * Lifecycle hook: the owning reel has landed on its final symbols.
   * Default: no-op. Override (e.g. SpineReelSymbol.autoPlayLanding) to fire
   * a landing animation concurrently with the bounce.
   */
  onReelLanded(): void {}
}
