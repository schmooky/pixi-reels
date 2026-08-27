import { Graphics } from 'pixi.js';
import type { MaskContext, MaskStrategy, ReelMaskRect } from './ReelViewport.js';
import { MASK_STRATEGY_VERSION } from './ReelViewport.js';

/**
 * A {@link MaskStrategy} that can draw into a Graphics somebody else owns.
 *
 * `build`/`update` each assume the strategy owns its Graphics, which makes two
 * strategies impossible to combine: you get two objects and a viewport that
 * accepts one. Splitting the drawing out fixes that, and every built-in
 * strategy implements it, so {@link composeMasks} and {@link inset} can wrap
 * any of them without reaching into private state.
 *
 * A strategy that only implements `build`/`update` still works everywhere a
 * `MaskStrategy` is accepted; `composeMasks` falls back to nesting its
 * Graphics as a child, which unions correctly but costs an extra node.
 */
export interface DrawableMaskStrategy extends MaskStrategy {
  /** Draw this strategy's shapes into `g`. Must not call `g.clear()`. */
  draw(g: Graphics, ctx: MaskContext): void;
}

/** True when `s` can draw into a foreign Graphics. */
export function isDrawableMaskStrategy(s: MaskStrategy): s is DrawableMaskStrategy {
  return typeof (s as Partial<DrawableMaskStrategy>).draw === 'function';
}

/** White, fully opaque. Mask fills are stencils; the colour never renders. */
const MASK_FILL = { color: 0xffffff } as const;

/** `ctx.origin` with the `undefined` case resolved. See {@link inset}. */
function originOf(ctx: MaskContext): { x: number; y: number } {
  return ctx.origin ?? { x: 0, y: 0 };
}

/**
 * The per-side screen outset `ctx.bleed` asks for, on the CROSS axis only.
 *
 * `?? 0` because `MaskContext` is public: a context built by third-party code
 * may predate the field, and `toScreen(undefined, 0)` yields a NaN rect - a
 * mask that clips everything, with no error anywhere.
 */
export function bleedOutset(ctx: MaskContext): { x: number; y: number } {
  return ctx.axis.toScreen(ctx.bleed ?? 0, 0);
}

/** Union bounding box of `rects`, or the viewport box when there are none. */
function boundsOf(ctx: MaskContext): ReelMaskRect {
  const o = originOf(ctx);
  if (ctx.rects.length === 0) {
    return { x: o.x, y: o.y, width: ctx.width, height: ctx.height };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of ctx.rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return { x: o.x + minX, y: o.y + minY, width: maxX - minX, height: maxY - minY };
}

/** Which corners of a reel box a {@link RoundedRectMaskStrategy} rounds. */
export type RoundedMaskScope =
  /**
   * Round the four corners of the union bounding box. The reels inside stay
   * one flush block, so this is safe at any cross gap - but on a pyramid or
   * MultiWays set it also throws the jagged silhouette away and shows buffer
   * cells past the ends of short reels. Use {@link SilhouetteMaskStrategy}
   * there.
   */
  | 'set'
  /**
   * Round the four corners of every reel box independently, so each reel
   * reads as its own rounded card.
   *
   * Only correct when reels are visually separated - a non-zero CROSS gap
   * (`symbolGap.x` on a vertical set, `symbolGap.y` on a horizontal one). At
   * gap `0` neighbouring reels share an edge, and rounding both sides of it
   * bites a lens-shaped notch out of the seam. The strategy warns once when
   * it sees touching rects.
   */
  | 'reel';

export interface RoundedRectMaskOptions {
  /** Corner radius in pixels. Pixi clamps it per corner to half the shorter adjacent edge. */
  radius: number;
  /** Which boxes get rounded. Default `'set'`. */
  scope?: RoundedMaskScope;
}

/**
 * Rounded-corner rectangles, per reel or per set.
 *
 * The straightforward upgrade from `RectMaskStrategy` / `SharedRectMaskStrategy`
 * when the frame art has rounded corners and the square mask corners poke out
 * from behind it.
 *
 * Honours `ctx.bleed` on the cross axis (like `SharedRectMaskStrategy`), so a
 * warped set with `curveBleed(...)` keeps its overhang.
 *
 * @example
 * // One rounded window around the whole grid.
 * builder.maskStrategy(new RoundedRectMaskStrategy({ radius: 18 }))
 *
 * @example
 * // Each reel its own rounded card. Needs a cross gap.
 * builder.symbolGap({ x: 12, y: 0 })
 *        .maskStrategy(new RoundedRectMaskStrategy({ radius: 14, scope: 'reel' }))
 */
export class RoundedRectMaskStrategy implements DrawableMaskStrategy {
  readonly version = MASK_STRATEGY_VERSION;

  private readonly _radius: number;
  private readonly _scope: RoundedMaskScope;
  private _warnedTouching = false;

  constructor(options: RoundedRectMaskOptions) {
    if (!Number.isFinite(options?.radius) || options.radius < 0) {
      throw new Error(
        `RoundedRectMaskStrategy: radius must be a non-negative number, got ${String(options?.radius)}.`,
      );
    }
    this._radius = options.radius;
    this._scope = options.scope ?? 'set';
  }

  build(ctx: MaskContext): Graphics {
    const g = new Graphics();
    this.draw(g, ctx);
    return g;
  }

  update(g: Graphics, ctx: MaskContext): void {
    g.clear();
    this.draw(g, ctx);
  }

  draw(g: Graphics, ctx: MaskContext): void {
    const out = bleedOutset(ctx);
    const o = originOf(ctx);

    if (this._scope === 'set' || ctx.rects.length === 0) {
      const b = boundsOf(ctx);
      g.roundRect(
        b.x - out.x,
        b.y - out.y,
        b.width + out.x * 2,
        b.height + out.y * 2,
        this._radius,
      ).fill(MASK_FILL);
      return;
    }

    this._warnIfTouching(ctx);
    for (const r of ctx.rects) {
      g.roundRect(
        o.x + r.x - out.x,
        o.y + r.y - out.y,
        r.width + out.x * 2,
        r.height + out.y * 2,
        this._radius,
      ).fill(MASK_FILL);
    }
  }

  /**
   * `scope: 'reel'` at cross gap 0 notches every seam. That reads as a
   * rendering bug rather than a configuration mistake, so say so once - not
   * per frame, and not as a throw, because a MultiWays reshape can legally
   * pass through a touching arrangement.
   */
  private _warnIfTouching(ctx: MaskContext): void {
    if (this._warnedTouching || ctx.rects.length < 2) return;
    const crossProp = ctx.axis.crossProp;
    const sizeProp = crossProp === 'x' ? 'width' : 'height';
    for (let i = 1; i < ctx.rects.length; i++) {
      const prev = ctx.rects[i - 1];
      const cur = ctx.rects[i];
      const gap = cur[crossProp] - (prev[crossProp] + prev[sizeProp]);
      if (Math.abs(gap) < 0.5) {
        this._warnedTouching = true;
        console.warn(
          "RoundedRectMaskStrategy: scope 'reel' with a zero cross gap rounds both sides " +
            'of every shared reel edge, which notches the seams. Add a cross gap ' +
            "(symbolGap.x on a vertical set), use scope 'set', or use SilhouetteMaskStrategy.",
        );
        return;
      }
    }
  }
}

/** One reel's box in (cross, main) space. See {@link SilhouetteMaskStrategy}. */
interface CrossMainSpan {
  c0: number;
  c1: number;
  m0: number;
  m1: number;
}

/** A ring vertex in (cross, main) space, with the radius its corner should use. */
interface RingPoint {
  c: number;
  m: number;
  radius: number;
}

const RING_EPS = 0.5;

export interface SilhouetteMaskOptions {
  /** Radius for the outward-facing (convex) corners. */
  radius: number;
  /**
   * Radius for the inward-facing (concave) corners of a staircase. Default =
   * `radius`. Concave corners sit where a short reel meets a tall one, and the
   * step there is often much shorter than the outer edges, so a smaller value
   * usually reads better. `0` leaves them sharp.
   */
  concaveRadius?: number;
}

/**
 * Rounds the OUTLINE of the whole reel set, staircase and all.
 *
 * On a pyramid / MultiWays layout `ctx.rects` is a staircase. Rounding each
 * rect independently notches every shared seam; rounding the bounding box
 * throws the staircase away and shows buffer cells past the short reels.
 * Neither is what anyone wants. This walks the rectilinear union outline of
 * the rects and rounds every vertex of it - the outer corners AND the inward
 * corners of each step.
 *
 * Reels are column-ordered and axis-aligned, so the outline needs no polygon
 * clipper: emit the leading main edge left to right, then the trailing main
 * edge right to left. O(reels).
 *
 * On a uniform (non-jagged) set the outline IS the bounding box, so this
 * degrades to a rounded rectangle with no special case.
 *
 * **Requires a zero cross gap.** With a gap the reels are genuinely disjoint
 * and their union is several rings, not one. The strategy detects that and
 * falls back to per-reel rounded rects, warning once.
 *
 * @example
 * builder.visibleCellsPerReel([3, 4, 5, 4, 3])
 *        .maskStrategy(new SilhouetteMaskStrategy({ radius: 24, concaveRadius: 10 }))
 */
export class SilhouetteMaskStrategy implements DrawableMaskStrategy {
  readonly version = MASK_STRATEGY_VERSION;

  private readonly _radius: number;
  private readonly _concaveRadius: number;
  private readonly _fallback: RoundedRectMaskStrategy;
  private _warnedDisjoint = false;

  constructor(options: SilhouetteMaskOptions) {
    if (!Number.isFinite(options?.radius) || options.radius < 0) {
      throw new Error(
        `SilhouetteMaskStrategy: radius must be a non-negative number, got ${String(options?.radius)}.`,
      );
    }
    const concave = options.concaveRadius ?? options.radius;
    if (!Number.isFinite(concave) || concave < 0) {
      throw new Error(
        `SilhouetteMaskStrategy: concaveRadius must be a non-negative number, got ${String(concave)}.`,
      );
    }
    this._radius = options.radius;
    this._concaveRadius = concave;
    this._fallback = new RoundedRectMaskStrategy({ radius: options.radius, scope: 'reel' });
  }

  build(ctx: MaskContext): Graphics {
    const g = new Graphics();
    this.draw(g, ctx);
    return g;
  }

  update(g: Graphics, ctx: MaskContext): void {
    g.clear();
    this.draw(g, ctx);
  }

  draw(g: Graphics, ctx: MaskContext): void {
    const spans = this._spans(ctx);
    if (spans.length === 0) {
      // No rects: the viewport box is all we know.
      const b = boundsOf(ctx);
      const out = bleedOutset(ctx);
      g.roundRect(
        b.x - out.x,
        b.y - out.y,
        b.width + out.x * 2,
        b.height + out.y * 2,
        this._radius,
      ).fill(MASK_FILL);
      return;
    }

    if (!this._isContiguous(spans)) {
      if (!this._warnedDisjoint) {
        this._warnedDisjoint = true;
        console.warn(
          'SilhouetteMaskStrategy: reels have a non-zero cross gap, so their union is not ' +
            'one outline. Falling back to per-reel rounded rects. Drop the cross gap to use ' +
            'the silhouette.',
        );
      }
      this._fallback.draw(g, ctx);
      return;
    }

    const ring = this._ring(spans);
    if (ring.length < 3) {
      // Degenerate (a single zero-extent reel). Nothing sensible to round.
      const b = boundsOf(ctx);
      g.rect(b.x, b.y, b.width, b.height).fill(MASK_FILL);
      return;
    }

    this._assignRadii(ring);

    const o = originOf(ctx);
    const points = ring.map((p) => {
      const s = ctx.axis.toScreen(p.c, p.m);
      return { x: o.x + s.x, y: o.y + s.y, radius: p.radius };
    });
    // Pixi clamps each corner to half the shorter adjacent edge internally, and
    // arcs concave vertices the opposite way from convex ones, so the ring can
    // be handed over as-is.
    g.roundShape(points, this._radius).fill(MASK_FILL);
  }

  /**
   * Project the reel rects into (cross, main) spans, ordered along the cross
   * axis, with `ctx.bleed` pushed onto the two outermost cross edges only -
   * inner edges are shared with a neighbour and have nothing to bleed into.
   */
  private _spans(ctx: MaskContext): CrossMainSpan[] {
    const axis = ctx.axis;
    const spans: CrossMainSpan[] = [];
    for (const r of ctx.rects) {
      const pos = axis.toLocal(r.x, r.y);
      const size = axis.toLocal(r.width, r.height);
      if (size.cross <= 0 || size.main <= 0) continue;
      spans.push({
        c0: pos.cross,
        c1: pos.cross + size.cross,
        m0: pos.main,
        m1: pos.main + size.main,
      });
    }
    spans.sort((a, b) => a.c0 - b.c0);
    // `!== 0`, not `> 0`: `inset(...)` expresses a cross-axis inset as a NEGATIVE
    // bleed, and a `> 0` guard would silently drop it.
    const bleed = ctx.bleed ?? 0;
    if (spans.length > 0 && bleed !== 0) {
      spans[0].c0 -= bleed;
      spans[spans.length - 1].c1 += bleed;
    }
    return spans;
  }

  private _isContiguous(spans: CrossMainSpan[]): boolean {
    for (let i = 1; i < spans.length; i++) {
      if (Math.abs(spans[i].c0 - spans[i - 1].c1) > RING_EPS) return false;
    }
    return true;
  }

  /**
   * Walk the rectilinear union outline: leading main edge in cross order, then
   * the trailing main edge back. Duplicate and collinear vertices are dropped
   * so a uniform set produces exactly four corners.
   */
  private _ring(spans: CrossMainSpan[]): RingPoint[] {
    const pts: Array<{ c: number; m: number }> = [];
    const push = (c: number, m: number): void => {
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.c - c) < RING_EPS && Math.abs(last.m - m) < RING_EPS) return;
      pts.push({ c, m });
    };

    const first = spans[0];
    const last = spans[spans.length - 1];

    push(first.c0, first.m0);
    for (let i = 1; i < spans.length; i++) {
      if (Math.abs(spans[i].m0 - spans[i - 1].m0) > RING_EPS) {
        push(spans[i].c0, spans[i - 1].m0);
        push(spans[i].c0, spans[i].m0);
      }
    }
    push(last.c1, last.m0);
    push(last.c1, last.m1);
    for (let i = spans.length - 1; i >= 1; i--) {
      if (Math.abs(spans[i].m1 - spans[i - 1].m1) > RING_EPS) {
        push(spans[i].c0, spans[i].m1);
        push(spans[i].c0, spans[i - 1].m1);
      }
    }
    push(first.c0, first.m1);

    // The ring closes back onto pts[0]; drop a trailing duplicate of it.
    while (
      pts.length > 1 &&
      Math.abs(pts[pts.length - 1].c - pts[0].c) < RING_EPS &&
      Math.abs(pts[pts.length - 1].m - pts[0].m) < RING_EPS
    ) {
      pts.pop();
    }

    return pts.map((p) => ({ c: p.c, m: p.m, radius: this._radius }));
  }

  /**
   * Tag each vertex convex or concave and give it the matching radius.
   *
   * Convexity is the sign of the 2D cross product of the incoming and outgoing
   * edges, compared against the ring's own winding (signed area) - so it does
   * not matter which way round the walk happened to emit the outline, which
   * depends on the axis.
   */
  private _assignRadii(ring: RingPoint[]): void {
    let area2 = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      area2 += a.c * b.m - b.c * a.m;
    }
    const winding = area2 >= 0 ? 1 : -1;

    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length];
      const cur = ring[i];
      const next = ring[(i + 1) % ring.length];
      const cross =
        (cur.c - prev.c) * (next.m - cur.m) - (cur.m - prev.m) * (next.c - cur.c);
      const convex = cross * winding >= 0;
      cur.radius = convex ? this._radius : this._concaveRadius;
    }
  }
}

/** Draws a mask however you like. See {@link PathMaskStrategy}. */
export type MaskPathFn = (g: Graphics, ctx: MaskContext) => void;

/**
 * Any mask you can draw, without the class.
 *
 * The smallest possible custom `MaskStrategy` is otherwise ~25 lines of
 * ceremony - a version marker, a `build`/`update` split, a `clear()` on
 * update - wrapped around one `g.rect(...)` call. This is that ceremony,
 * written once.
 *
 * `ctx.axis`, `ctx.rects` and `ctx.bleed` are all in scope, so an orientation-
 * aware mask stays a one-liner. Do not call `g.clear()`; the strategy already
 * did.
 *
 * @example
 * // A hexagon over the whole board.
 * builder.maskStrategy(new PathMaskStrategy((g, ctx) => {
 *   g.regularPoly(ctx.width / 2, ctx.height / 2, ctx.height / 2, 6).fill({ color: 0xffffff });
 * }))
 *
 * @example
 * // A frame: everything except a hole in the middle. `cut()` subtracts from
 * // the last shape that was already FILLED, so the fill comes first - draw the
 * // hole before filling and it finds nothing to cut from, leaving an empty
 * // mask and an invisible board.
 * builder.maskStrategy(new PathMaskStrategy((g, ctx) => {
 *   g.rect(0, 0, ctx.width, ctx.height).fill({ color: 0xffffff });
 *   g.rect(60, 60, ctx.width - 120, ctx.height - 120).cut();
 * }))
 */
export class PathMaskStrategy implements DrawableMaskStrategy {
  readonly version = MASK_STRATEGY_VERSION;

  constructor(private readonly _path: MaskPathFn) {
    if (typeof _path !== 'function') {
      throw new Error('PathMaskStrategy: expected a (graphics, context) => void function.');
    }
  }

  build(ctx: MaskContext): Graphics {
    const g = new Graphics();
    this.draw(g, ctx);
    return g;
  }

  update(g: Graphics, ctx: MaskContext): void {
    g.clear();
    this.draw(g, ctx);
  }

  draw(g: Graphics, ctx: MaskContext): void {
    this._path(g, ctx);
  }
}

/**
 * Shrink (or grow) any strategy's mask by a uniform number of pixels.
 *
 * The fix for "the art bleeds a pixel past the frame" that does not involve
 * rewriting the strategy. Positive `pixels` shrinks on all four sides;
 * negative grows.
 *
 * Implemented by handing the wrapped strategy a derived {@link MaskContext} -
 * shrunken rects, a shrunken viewport box, and an `origin` shift for the
 * strategies that draw from `(0, 0)`. `ctx.bleed` is passed through unchanged,
 * so an inset composes with curve bleed rather than cancelling it.
 *
 * A custom strategy that ignores `ctx.origin` insets in size but not in
 * position. Every built-in honours it.
 *
 * @example
 * builder.maskStrategy(inset(new SilhouetteMaskStrategy({ radius: 20 }), 3))
 */
export function inset(strategy: MaskStrategy, pixels: number): DrawableMaskStrategy {
  if (!Number.isFinite(pixels)) {
    throw new Error(`inset(): expected a finite number of pixels, got ${String(pixels)}.`);
  }
  const shrink = (ctx: MaskContext): MaskContext => {
    const o = originOf(ctx);
    const vertical = ctx.axis.mainProp === 'y';
    // The two axes are inset by different mechanisms, and mixing them
    // double-counts.
    //
    // CROSS goes through `bleed`, negated. Every strategy already knows what
    // its cross edges are, and they disagree for good reasons: a per-reel mask
    // insets each reel's own sides, a shared box insets the outer pair, and the
    // silhouette insets only the two outermost reels - shrinking each rect's
    // cross size directly would instead open a gap between neighbouring reels
    // and break the silhouette's contiguity test.
    //
    // MAIN goes through the rect SIZES plus `origin`. Moving the rects as well
    // as setting the origin would apply the offset twice.
    const bleed = (ctx.bleed ?? 0) - pixels;
    const shrinkMain = (main: number): number => main - pixels * 2;
    return {
      rects: ctx.rects.map((r) => ({
        x: r.x,
        y: r.y,
        width: vertical ? r.width : shrinkMain(r.width),
        height: vertical ? shrinkMain(r.height) : r.height,
      })),
      width: vertical ? ctx.width : shrinkMain(ctx.width),
      height: vertical ? shrinkMain(ctx.height) : ctx.height,
      axis: ctx.axis,
      bleed,
      origin: vertical ? { x: o.x, y: o.y + pixels } : { x: o.x + pixels, y: o.y },
    };
  };

  return {
    version: MASK_STRATEGY_VERSION,
    build: (ctx) => strategy.build(shrink(ctx)),
    update: (g, ctx) => strategy.update(g, shrink(ctx)),
    draw: (g, ctx) => drawInto(strategy, g, shrink(ctx)),
  };
}

/**
 * Union several strategies into one mask.
 *
 * **Union only.** A PixiJS Graphics mask is the union of every filled shape in
 * it, and there is no way to intersect or subtract the output of two
 * independent strategies. (`Graphics.cut()` subtracts a hole from a path
 * *within* one strategy - see {@link PathMaskStrategy} - which is the tool for
 * that job.)
 *
 * The motivating case is a reel set plus a detached banner or side cell that
 * has to share the viewport's single mask.
 *
 * @example
 * builder.maskStrategy(composeMasks(
 *   new SilhouetteMaskStrategy({ radius: 20 }),
 *   new PathMaskStrategy((g, ctx) => {
 *     g.roundRect(0, -90, ctx.width, 70, 12).fill({ color: 0xffffff });
 *   }),
 * ))
 */
export function composeMasks(...strategies: MaskStrategy[]): DrawableMaskStrategy {
  if (strategies.length === 0) {
    throw new Error('composeMasks(): expected at least one strategy.');
  }
  // Non-drawable strategies own their Graphics, so they are nested as children
  // instead. A Pixi stencil mask renders the mask container's whole subtree, so
  // a nested Graphics unions with the parent's own shapes - at the cost of one
  // scene node, and of a `update` that has to find its child again.
  const nested = new WeakMap<Graphics, Map<MaskStrategy, Graphics>>();

  const drawAll = (g: Graphics, ctx: MaskContext): void => {
    let children = nested.get(g);
    for (const s of strategies) {
      if (isDrawableMaskStrategy(s)) {
        s.draw(g, ctx);
        continue;
      }
      const existing = children?.get(s);
      if (existing) {
        s.update(existing, ctx);
      } else {
        const child = s.build(ctx);
        if (!children) {
          children = new Map();
          nested.set(g, children);
        }
        children.set(s, child);
        g.addChild(child);
      }
    }
  };

  return {
    version: MASK_STRATEGY_VERSION,
    build(ctx) {
      const g = new Graphics();
      drawAll(g, ctx);
      return g;
    },
    update(g, ctx) {
      g.clear();
      drawAll(g, ctx);
    },
    draw: drawAll,
  };
}

/**
 * Draw `strategy` into `g`, whether or not it implements
 * {@link DrawableMaskStrategy}. Non-drawable strategies get their own Graphics
 * nested as a child, which unions the same way.
 */
function drawInto(strategy: MaskStrategy, g: Graphics, ctx: MaskContext): void {
  if (isDrawableMaskStrategy(strategy)) {
    strategy.draw(g, ctx);
    return;
  }
  g.addChild(strategy.build(ctx));
}
