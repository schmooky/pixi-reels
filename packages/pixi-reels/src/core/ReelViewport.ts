import { Container, Graphics } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { ReelAxis } from './ReelAxis.js';
import { VERTICAL_FORWARD } from './ReelAxis.js';

/**
 * Bounding rectangle for one reel. what `MaskStrategy` builds the clip
 * geometry from. SCREEN-space and viewport-local (origin = viewport
 * top-left), in reel order.
 *
 * The rect is screen-space in every orientation, so which of its four
 * numbers means "along the strip" depends on the axis: on a vertical set
 * `y`/`height` run along the strip and `x`/`width` march the reels; on a
 * horizontal set that is exactly reversed. Read {@link MaskContext.axis}
 * rather than assuming - `axis.toLocal(width, height)` gives you the pair
 * as `{ cross, main }`.
 */
export interface ReelMaskRect {
  /** Left edge, viewport-local. */
  x: number;
  /** Top edge, viewport-local. */
  y: number;
  /** Screen width of the reel box. */
  width: number;
  /** Screen height of the reel box. */
  height: number;
}

/**
 * Everything a mask strategy is given. Passed as one object so the axis
 * cannot be forgotten, and so later additions do not break the signature.
 */
export interface MaskContext {
  /** One rect per reel, in reel order. Empty before the builder supplies them. */
  readonly rects: readonly ReelMaskRect[];
  /** Viewport bounding-box width. */
  readonly width: number;
  /** Viewport bounding-box height. */
  readonly height: number;
  /**
   * The set's travel axis. `axis.mainProp` is the screen axis strips run
   * along, so a strategy that rounds "the ends of each reel" can round the
   * right two corners instead of guessing.
   */
  readonly axis: ReelAxis;
  /**
   * Cross-axis room, per side, that `curveBleed` asked for. Art wider than its
   * cell hangs over by this much, so a strategy that clips to the board would
   * cut it straight back off - the outermost reels worst of all, where the
   * overhang leaves the board entirely. Inflate by it on the CROSS axis only:
   * the main axis is where the buffer cells live, and they are meant to stay
   * hidden. `0` unless `ReelSetBuilder.curveBleed()` was called.
   */
  readonly bleed: number;
}

/**
 * Version marker every strategy must carry. A v1 strategy has positional
 * `(rects, totalWidth, totalHeight)` parameters and no axis; handed a
 * {@link MaskContext} it would read `rects` as an object, find no `.length`,
 * and quietly fall through to a full-bleed rect - clipping nothing, with no
 * error. The marker turns that into a named throw at `maskStrategy()`.
 */
export const MASK_STRATEGY_VERSION = 2;

/**
 * Strategy for building the viewport's clip mask. Public. pass a custom
 * implementation to `ReelSetBuilder.maskStrategy(...)` to clip the reels
 * with any shape PixiJS Graphics can express (rounded frames, hex grids,
 * etc.). Two ship with the engine:
 *
 * - {@link RectMaskStrategy}. one rect per reel (default). Good for
 *   pyramid layouts; symbols never leak buffer cells past a short reel's
 *   ends.
 * - {@link SharedRectMaskStrategy}. single bounding-box rect spanning
 *   every reel. Big symbols spanning multiple reels render correctly even
 *   when reels have a cross-axis gap; cross-reel overlap (e.g. a 2x2 bonus
 *   straddling reel 2 and 3 with a non-zero cross gap) needs this strategy.
 *
 * **v2:** both methods take a single {@link MaskContext} instead of
 * positional arguments, and the context carries the axis. Implementations
 * must set `version = MASK_STRATEGY_VERSION`.
 */
export interface MaskStrategy {
  /**
   * Must equal {@link MASK_STRATEGY_VERSION}. Validated by
   * `ReelSetBuilder.maskStrategy()`.
   */
  readonly version: typeof MASK_STRATEGY_VERSION;
  /** Build (or rebuild) the mask graphic. Returns the Graphics to use as the mask. */
  build(ctx: MaskContext): Graphics;
  /** Update the mask when reel boxes resize (e.g. MultiWays reshape). */
  update(graphics: Graphics, ctx: MaskContext): void;
}

/**
 * v1 default: a per-reel rectangular mask. Each reel is clipped to its own
 * `(mainOffset, extent)` box so pyramid shapes clip cleanly without
 * buffer-cell peek above or below short reels.
 *
 * PixiJS masks support multiple shapes inside a single Graphics. the union
 * of every filled shape is the visible region. So drawing one rect per reel
 * gives the engine a jagged-but-rectangular mask without a custom shader.
 *
 * **Caveat:** if reels have a non-zero CROSS-axis gap (`symbolGap.x` on a
 * vertical set, `symbolGap.y` on a horizontal one), a symbol that extends
 * across the gap (e.g. a 2x2 bonus) will be clipped between the reels. Use
 * {@link SharedRectMaskStrategy} in that case, or drop the cross gap to 0.
 *
 * If `rects` is empty (the builder hasn't supplied per-reel rects yet),
 * this falls back to a single bounding-box rect.
 */
export class RectMaskStrategy implements MaskStrategy {
  readonly version = MASK_STRATEGY_VERSION;

  build(ctx: MaskContext): Graphics {
    const g = new Graphics();
    this._draw(g, ctx);
    return g;
  }

  update(g: Graphics, ctx: MaskContext): void {
    g.clear();
    this._draw(g, ctx);
  }

  private _draw(g: Graphics, ctx: MaskContext): void {
    if (ctx.rects.length === 0) {
      g.rect(0, 0, ctx.width, ctx.height).fill({ color: 0xffffff });
      return;
    }
    for (const r of ctx.rects) {
      g.rect(r.x, r.y, r.width, r.height).fill({ color: 0xffffff });
    }
  }
}

/**
 * Single bounding-box mask covering every reel. Use this
 * when symbols need to overlap across reel boundaries. typical for slots
 * with big symbols that span multiple reels (a 2x2 bonus, a 3x3 giant)
 * AND a non-zero cross-axis gap. Per-reel rects would clip those symbols at
 * the gaps; a single shared rect keeps them visible.
 *
 * Pyramid layouts using this strategy will show buffer cells past the ends
 * of short reels (the "pyramid peek". covered by frame art in production).
 *
 * @example
 * builder.maskStrategy(new SharedRectMaskStrategy())
 */
export class SharedRectMaskStrategy implements MaskStrategy {
  readonly version = MASK_STRATEGY_VERSION;

  build(ctx: MaskContext): Graphics {
    const g = new Graphics();
    this._draw(g, ctx);
    return g;
  }

  update(g: Graphics, ctx: MaskContext): void {
    g.clear();
    this._draw(g, ctx);
  }

  private _draw(g: Graphics, ctx: MaskContext): void {
    // Cross axis only - `toScreen(bleed, 0)` puts it on x for a vertical set
    // and on y for a horizontal one, so this needs no orientation branch.
    // `?? 0` because `MaskContext` is public and `bleed` was added after v2
    // shipped: a context built by third-party code predates the field, and
    // `toScreen(undefined, 0)` would quietly produce a NaN rect - a mask that
    // clips everything, with no error anywhere.
    const out = ctx.axis.toScreen(ctx.bleed ?? 0, 0);
    g.rect(-out.x, -out.y, ctx.width + out.x * 2, ctx.height + out.y * 2).fill({
      color: 0xffffff,
    });
  }
}

/**
 * The clipping window + layering tricks for a reel set.
 *
 * The viewport is the "looking-glass" of the slot: a rectangle the size
 * of the visible grid with a PixiJS mask so symbols scrolling above or
 * below the visible cells are hidden. It also provides three stacking
 * layers so win animations can break out of the mask:
 *
 *   - `maskedContainer`. the normal place for reels. Clipped to the
 *     visible area so buffer cells never leak.
 *   - `unmaskedContainer`. rendered on top of the mask. Use for a symbol
 *     whose celebration animation expands beyond its cell (a big expanding
 *     wild, a splash frame).
 *   - `spotlightContainer`. above everything else. Win spotlight lifts
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
  private readonly _axis: ReelAxis;
  private readonly _bleed: number;
  private _isDestroyed = false;
  /**
   * Number of active dim requests. The single overlay is shared by the
   * spotlight and cascade `destroySymbols({ dim })`; reference-counting it
   * keeps the dim up until the LAST consumer releases it, so an overlapping
   * pair can't hide it out from under the other.
   */
  private _dimCount = 0;

  constructor(
    width: number,
    height: number,
    position: { x: number; y: number } = { x: 0, y: 0 },
    maskStrategy: MaskStrategy = new RectMaskStrategy(),
    axis: ReelAxis = VERTICAL_FORWARD,
    bleed = 0,
  ) {
    super();
    this.x = position.x;
    this.y = position.y;
    this._maskStrategy = maskStrategy;
    this._maskWidth = width;
    this._maskHeight = height;
    this._axis = axis;
    this._bleed = bleed;

    this._mask = this._maskStrategy.build(this._maskContext());

    this.maskedContainer = new Container();
    this.maskedContainer.sortableChildren = true;
    this.maskedContainer.addChild(this._mask);
    this.maskedContainer.mask = this._mask;
    this.addChild(this.maskedContainer);

    this.unmaskedContainer = new Container();
    this.unmaskedContainer.sortableChildren = true;
    this.addChild(this.unmaskedContainer);

    this.dimOverlay = new Graphics();
    this.dimOverlay.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.5 });
    this.dimOverlay.visible = false;
    this.addChild(this.dimOverlay);

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
  /** The set's travel axis. Read by debug overlays and mask strategies. */
  get axis(): ReelAxis { return this._axis; }

  private _maskContext(): MaskContext {
    return {
      rects: this._maskRects,
      width: this._maskWidth,
      height: this._maskHeight,
      axis: this._axis,
      bleed: this._bleed,
    };
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** Show the dim overlay with given opacity. Reference-counted with hideDim. */
  showDim(alpha: number = 0.5): void {
    this._dimCount++;
    this.dimOverlay.alpha = alpha;
    this.dimOverlay.visible = true;
  }

  /** Release one dim request; hides the overlay only when the last one clears. */
  hideDim(): void {
    if (this._dimCount > 0) this._dimCount--;
    if (this._dimCount === 0) this.dimOverlay.visible = false;
  }

  /** Update mask size and per-reel rects. Used after pyramid/MultiWays shape changes. */
  updateMaskSize(width: number, height: number, rects: ReelMaskRect[] = []): void {
    this._maskWidth = width;
    this._maskHeight = height;
    this._maskRects = rects;
    this._maskStrategy.update(this._mask, this._maskContext());
    // The dim overlay is sized once at construction; a viewport resize (e.g.
    // a MultiWays reshape growing the tallest reel) must resize it too, or the
    // spotlight dims a stale rectangle. Its runtime alpha is set by showDim.
    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.5 });
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    super.destroy({ children: true });
  }
}
