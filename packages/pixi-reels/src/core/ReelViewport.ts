import { Container, Graphics } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';

/**
 * The clipping window + layering tricks for a reel set.
 *
 * The viewport is the "looking-glass" of the slot: a rectangle the size
 * of the visible grid with a PixiJS mask so symbols scrolling above or
 * below the visible rows are hidden. It also provides three stacking
 * layers so win animations can break out of the mask:
 *
 *   - `maskedContainer` — the normal place for reels. Clipped to the
 *     visible area so buffer rows never leak.
 *   - `unmaskedContainer` — rendered on top of the mask. Use for a symbol
 *     whose celebration animation expands beyond its cell (a big expanding
 *     wild, a splash frame).
 *   - `spotlightContainer` — above everything else. Win spotlight lifts
 *     winning symbols here temporarily so dim overlay + bounce don't clip.
 *
 * `dimOverlay` is a semi-transparent rectangle the spotlight fades in
 * behind the promoted winners to visually push the losers into the
 * background.
 */
export class ReelViewport extends Container implements Disposable {
  public readonly maskedContainer: Container;
  public readonly unmaskedContainer: Container;
  public readonly spotlightContainer: Container;
  public readonly dimOverlay: Graphics;

  private _mask: Graphics;
  private _isDestroyed = false;

  constructor(
    width: number,
    height: number,
    position: { x: number; y: number } = { x: 0, y: 0 },
  ) {
    super();
    this.x = position.x;
    this.y = position.y;

    // Create mask graphic
    this._mask = new Graphics();
    this._mask.rect(0, 0, width, height).fill({ color: 0xffffff });

    // Masked container — main symbol area
    this.maskedContainer = new Container();
    this.maskedContainer.sortableChildren = true;
    this.maskedContainer.addChild(this._mask);
    this.maskedContainer.mask = this._mask;
    this.addChild(this.maskedContainer);

    // Unmasked container — for symbols with unmask flag
    this.unmaskedContainer = new Container();
    this.unmaskedContainer.sortableChildren = true;
    this.addChild(this.unmaskedContainer);

    // Dim overlay — for win animations
    this.dimOverlay = new Graphics();
    this.dimOverlay.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.5 });
    this.dimOverlay.visible = false;
    this.addChild(this.dimOverlay);

    // Spotlight container — promoted symbols render above everything
    this.spotlightContainer = new Container();
    this.spotlightContainer.sortableChildren = true;
    this.addChild(this.spotlightContainer);
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** Show the dim overlay with given opacity. */
  showDim(alpha: number = 0.5): void {
    this.dimOverlay.alpha = alpha;
    this.dimOverlay.visible = true;
  }

  /** Hide the dim overlay. */
  hideDim(): void {
    this.dimOverlay.visible = false;
  }

  /** Update mask size (e.g., for Megaways variable rows). */
  updateMaskSize(width: number, height: number): void {
    this._mask.clear();
    this._mask.rect(0, 0, width, height).fill({ color: 0xffffff });
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    super.destroy({ children: true });
  }
}
