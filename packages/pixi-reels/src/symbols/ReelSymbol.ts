import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';

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
   * Activate the symbol with a new identity.
   * Called when the symbol enters the visible reel or is recycled from the pool.
   */
  activate(symbolId: string): void {
    this._symbolId = symbolId;
    this.view.visible = true;
    this.onActivate(symbolId);
  }

  /**
   * Deactivate the symbol before returning it to the pool.
   * Stops any running animations and hides the view.
   */
  deactivate(): void {
    this.stopAnimation();
    this.onDeactivate();
    this._symbolId = '';
    this.view.visible = false;
  }

  /** Pool reset — aliases deactivate. */
  reset(): void {
    this.deactivate();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this.deactivate();
    this.onDestroy();
    this.view.destroy({ children: true });
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
