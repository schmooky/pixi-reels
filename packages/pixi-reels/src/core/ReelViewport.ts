import { Container, Graphics } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';

/**
 * Bounding rectangle for one reel — what `MaskStrategy` builds the clip
 * geometry from. Local to ReelViewport (origin = viewport top-left).
 */
export interface ReelMaskRect {
  /** Left edge of the reel column (= reel.container.x). */
  x: number;
  /** Top edge of the reel box (= reel.offsetY). */
  y: number;
  /** Width of the reel column — equals one symbol cell wide. */
  width: number;
  /** Height of the reel box — equals reel.reelHeight. */
  height: number;
}

/**
 * Strategy for building the viewport's clip mask. Exposed internally so a
 * future v2 can swap a stencil/shape mask without changing the viewport
 * surface. Kept internal in v1 — `RectMaskStrategy` is the only impl shipped.
 */
export interface MaskStrategy {
  /** Build (or rebuild) the mask graphic. Returns the Graphics to use as the mask. */
  build(rects: ReelMaskRect[], totalWidth: number, totalHeight: number): Graphics;
  /** Update the mask when reel boxes resize (e.g. Megaways reshape). */
  update(graphics: Graphics, rects: ReelMaskRect[], totalWidth: number, totalHeight: number): void;
}

/**
 * v1 default: a per-reel rectangular mask. Each reel is clipped to its own
 * `(offsetY, reelHeight)` box so pyramid shapes (and uniform shapes) clip
 * cleanly without buffer-row peek.
 *
 * PixiJS masks support multiple shapes inside a single Graphics — the union
 * of every filled shape is the visible region. So drawing one rect per reel
 * gives the engine a jagged-but-rectangular mask without a custom shader.
 *
 * If `rects` is empty (e.g. before the builder calls `updateMaskSize` with
 * per-reel rects), this falls back to a single bounding-box rect.
 */
export class RectMaskStrategy implements MaskStrategy {
  build(rects: ReelMaskRect[], totalWidth: number, totalHeight: number): Graphics {
    const g = new Graphics();
    this._draw(g, rects, totalWidth, totalHeight);
    return g;
  }

  update(g: Graphics, rects: ReelMaskRect[], totalWidth: number, totalHeight: number): void {
    g.clear();
    this._draw(g, rects, totalWidth, totalHeight);
  }

  private _draw(g: Graphics, rects: ReelMaskRect[], totalW: number, totalH: number): void {
    if (rects.length === 0) {
      g.rect(0, 0, totalW, totalH).fill({ color: 0xffffff });
      return;
    }
    for (const r of rects) {
      g.rect(r.x, r.y, r.width, r.height).fill({ color: 0xffffff });
    }
  }
}

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
  private _maskStrategy: MaskStrategy;
  private _maskWidth: number;
  private _maskHeight: number;
  private _maskRects: ReelMaskRect[] = [];
  private _isDestroyed = false;

  constructor(
    width: number,
    height: number,
    position: { x: number; y: number } = { x: 0, y: 0 },
    maskStrategy: MaskStrategy = new RectMaskStrategy(),
  ) {
    super();
    this.x = position.x;
    this.y = position.y;
    this._maskStrategy = maskStrategy;
    this._maskWidth = width;
    this._maskHeight = height;

    // Create mask graphic
    this._mask = this._maskStrategy.build(this._maskRects, width, height);

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

  /** The viewport mask bounding box width (independent of children bounds). */
  get maskWidth(): number { return this._maskWidth; }
  /** The viewport mask bounding box height. */
  get maskHeight(): number { return this._maskHeight; }
  /** Per-reel mask rects last passed to the strategy. Used by debug overlays. */
  get maskRects(): readonly ReelMaskRect[] { return this._maskRects; }
  /** Internal mask Graphics. Exposed so debug helpers can recolor it. */
  get maskGraphics(): Graphics { return this._mask; }

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

  /** Update mask size and per-reel rects. Used after pyramid/Megaways shape changes. */
  updateMaskSize(width: number, height: number, rects: ReelMaskRect[] = []): void {
    this._maskWidth = width;
    this._maskHeight = height;
    this._maskRects = rects;
    this._maskStrategy.update(this._mask, this._maskRects, width, height);
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    super.destroy({ children: true });
  }
}
