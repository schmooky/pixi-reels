/**
 * The mask primitives beyond the rectangle: rounded reel/set boxes, the
 * rectilinear silhouette of a jagged set, the path escape hatch, and the
 * inset / compose decorators. Plus the `RectMaskStrategy` curve-bleed fix.
 *
 * Geometry is read back off the Graphics context rather than rendered: a
 * `fill()` instruction carries the path that produced it, so the exact rects
 * and ring vertices a strategy emitted are inspectable with no renderer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Graphics } from 'pixi.js';
import {
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type MaskContext,
  MASK_STRATEGY_VERSION,
  type MaskStrategy,
  type ReelMaskRect,
} from '../../src/core/ReelViewport.js';
import {
  RoundedRectMaskStrategy,
  SilhouetteMaskStrategy,
  PathMaskStrategy,
  composeMasks,
  inset,
  isDrawableMaskStrategy,
} from '../../src/core/maskStrategies.js';
import { reelAxis, VERTICAL_FORWARD } from '../../src/core/ReelAxis.js';

// ── Reading geometry back off a Graphics ─────────────────

interface DrawnRect {
  kind: 'rect' | 'roundRect';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}
interface DrawnRing {
  kind: 'roundShape';
  points: Array<{ x: number; y: number; radius?: number }>;
}
type Drawn = DrawnRect | DrawnRing;

function shapes(g: Graphics): Drawn[] {
  const out: Drawn[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reading Pixi's
  // internal instruction list is the only renderer-free way to assert geometry.
  for (const ins of g.context.instructions as any[]) {
    if (ins.action !== 'fill') continue;
    for (const p of ins.data.path.instructions) {
      if (p.action === 'rect') {
        const [x, y, width, height] = p.data;
        out.push({ kind: 'rect', x, y, width, height });
      } else if (p.action === 'roundRect') {
        const [x, y, width, height, radius] = p.data;
        out.push({ kind: 'roundRect', x, y, width, height, radius });
      } else if (p.action === 'roundShape') {
        out.push({ kind: 'roundShape', points: p.data[0] });
      }
    }
  }
  return out;
}

// ── Contexts ─────────────────────────────────────────────

/** Uniform 3-reel vertical set: 100 wide cells, 300 tall strips, no gap. */
function uniformCtx(overrides: Partial<MaskContext> = {}): MaskContext {
  const rects: ReelMaskRect[] = [
    { x: 0, y: 0, width: 100, height: 300 },
    { x: 100, y: 0, width: 100, height: 300 },
    { x: 200, y: 0, width: 100, height: 300 },
  ];
  return { rects, width: 300, height: 300, axis: VERTICAL_FORWARD, bleed: 0, ...overrides };
}

/**
 * A 3-4-3 pyramid, centre-anchored: the tall middle reel starts 50px higher
 * and ends 50px lower than its neighbours. Four staircase steps in the
 * outline, two convex and two concave.
 */
function pyramidCtx(overrides: Partial<MaskContext> = {}): MaskContext {
  const rects: ReelMaskRect[] = [
    { x: 0, y: 50, width: 100, height: 300 },
    { x: 100, y: 0, width: 100, height: 400 },
    { x: 200, y: 50, width: 100, height: 300 },
  ];
  return { rects, width: 300, height: 400, axis: VERTICAL_FORWARD, bleed: 0, ...overrides };
}

/** The same pyramid transposed onto a horizontal set. */
function pyramidHorizontalCtx(): MaskContext {
  const rects: ReelMaskRect[] = [
    { x: 50, y: 0, width: 300, height: 100 },
    { x: 0, y: 100, width: 400, height: 100 },
    { x: 50, y: 200, width: 300, height: 100 },
  ];
  return {
    rects,
    width: 400,
    height: 300,
    axis: reelAxis('horizontal', 'forward'),
    bleed: 0,
  };
}

describe('RoundedRectMaskStrategy', () => {
  afterEach(() => vi.restoreAllMocks());

  it("scope 'set' draws one rounded box around the whole grid", () => {
    const g = new RoundedRectMaskStrategy({ radius: 16 }).build(uniformCtx());
    expect(shapes(g)).toEqual([
      { kind: 'roundRect', x: 0, y: 0, width: 300, height: 300, radius: 16 },
    ]);
  });

  it("scope 'set' bounds the JAGGED silhouette, not just the first reel", () => {
    const g = new RoundedRectMaskStrategy({ radius: 8 }).build(pyramidCtx());
    // Union box of the 3-4-3: from the tall reel's top to its bottom.
    expect(shapes(g)).toEqual([
      { kind: 'roundRect', x: 0, y: 0, width: 300, height: 400, radius: 8 },
    ]);
  });

  it("scope 'reel' draws one rounded box per reel", () => {
    const ctx = pyramidCtx({
      rects: [
        { x: 0, y: 50, width: 90, height: 300 },
        { x: 100, y: 0, width: 90, height: 400 },
        { x: 200, y: 50, width: 90, height: 300 },
      ],
    });
    const drawn = shapes(new RoundedRectMaskStrategy({ radius: 12, scope: 'reel' }).build(ctx));
    expect(drawn).toHaveLength(3);
    expect(drawn[1]).toEqual({
      kind: 'roundRect',
      x: 100,
      y: 0,
      width: 90,
      height: 400,
      radius: 12,
    });
  });

  it("scope 'reel' warns once when reels touch, because that notches every seam", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new RoundedRectMaskStrategy({ radius: 12, scope: 'reel' });
    s.build(uniformCtx());
    s.update(new Graphics(), uniformCtx());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('cross gap');
  });

  it('stays quiet when a cross gap separates the reels', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = uniformCtx({
      rects: [
        { x: 0, y: 0, width: 90, height: 300 },
        { x: 100, y: 0, width: 90, height: 300 },
      ],
    });
    new RoundedRectMaskStrategy({ radius: 12, scope: 'reel' }).build(ctx);
    expect(warn).not.toHaveBeenCalled();
  });

  it('inflates on the CROSS axis only for curve bleed', () => {
    const g = new RoundedRectMaskStrategy({ radius: 10 }).build(uniformCtx({ bleed: 20 }));
    // Vertical set: cross is x. Width grows by 2 * bleed, height untouched.
    expect(shapes(g)).toEqual([
      { kind: 'roundRect', x: -20, y: 0, width: 340, height: 300, radius: 10 },
    ]);
  });

  it('rejects a negative radius at construction rather than at draw time', () => {
    expect(() => new RoundedRectMaskStrategy({ radius: -4 })).toThrow(/non-negative/);
  });
});

describe('SilhouetteMaskStrategy', () => {
  afterEach(() => vi.restoreAllMocks());

  it('degrades to a plain four-corner ring on a uniform set', () => {
    const drawn = shapes(new SilhouetteMaskStrategy({ radius: 20 }).build(uniformCtx()));
    expect(drawn).toHaveLength(1);
    const ring = drawn[0] as DrawnRing;
    expect(ring.kind).toBe('roundShape');
    expect(ring.points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ]);
  });

  it('walks the staircase of a pyramid, keeping every step', () => {
    const drawn = shapes(new SilhouetteMaskStrategy({ radius: 20 }).build(pyramidCtx()));
    const ring = drawn[0] as DrawnRing;
    // Leading edge left to right, then the trailing edge back. Eight vertices:
    // four on the top staircase, four on the bottom.
    expect(ring.points.map((p) => [p.x, p.y])).toEqual([
      [0, 50],
      [100, 50],
      [100, 0],
      [200, 0],
      [200, 50],
      [300, 50],
      [300, 350],
      [200, 350],
      [200, 400],
      [100, 400],
      [100, 350],
      [0, 350],
    ]);
  });

  it('gives concave step corners their own radius', () => {
    const drawn = shapes(
      new SilhouetteMaskStrategy({ radius: 20, concaveRadius: 4 }).build(pyramidCtx()),
    );
    const ring = drawn[0] as DrawnRing;
    const byPoint = new Map(ring.points.map((p) => [`${p.x},${p.y}`, p.radius]));
    // (100,50) is where the short reel's top meets the tall reel's side: the
    // outline turns INTO the shape there.
    expect(byPoint.get('100,50')).toBe(4);
    expect(byPoint.get('200,50')).toBe(4);
    // The tall reel's own top corners bulge outward.
    expect(byPoint.get('100,0')).toBe(20);
    expect(byPoint.get('200,0')).toBe(20);
    // So do the outermost corners of the short reels.
    expect(byPoint.get('0,50')).toBe(20);
    expect(byPoint.get('300,50')).toBe(20);
  });

  it('produces the transposed ring on a horizontal set', () => {
    const drawn = shapes(new SilhouetteMaskStrategy({ radius: 20 }).build(pyramidHorizontalCtx()));
    const ring = drawn[0] as DrawnRing;
    const vertical = shapes(new SilhouetteMaskStrategy({ radius: 20 }).build(pyramidCtx()));
    const verticalRing = vertical[0] as DrawnRing;
    // Same outline, x and y swapped. A relative law needs an absolute anchor
    // (ADR 018), so the vertical ring above is asserted by literal coordinates.
    expect(ring.points.map((p) => [p.x, p.y])).toEqual(
      verticalRing.points.map((p) => [p.y, p.x]),
    );
  });

  it('tags concavity the same way in both orientations', () => {
    const h = shapes(
      new SilhouetteMaskStrategy({ radius: 20, concaveRadius: 4 }).build(pyramidHorizontalCtx()),
    )[0] as DrawnRing;
    const byPoint = new Map(h.points.map((p) => [`${p.x},${p.y}`, p.radius]));
    expect(byPoint.get('50,100')).toBe(4);
    expect(byPoint.get('0,100')).toBe(20);
  });

  it('pushes curve bleed onto the two outer cross edges only', () => {
    const drawn = shapes(new SilhouetteMaskStrategy({ radius: 10 }).build(uniformCtx({ bleed: 15 })));
    const ring = drawn[0] as DrawnRing;
    const xs = ring.points.map((p) => p.x);
    expect(Math.min(...xs)).toBe(-15);
    expect(Math.max(...xs)).toBe(315);
    // Main axis untouched: the buffer cells past the ends stay hidden.
    expect(ring.points.map((p) => p.y)).toEqual([0, 0, 300, 300]);
  });

  it('falls back to per-reel rounded rects when a cross gap makes the union disjoint', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = uniformCtx({
      rects: [
        { x: 0, y: 0, width: 90, height: 300 },
        { x: 100, y: 0, width: 90, height: 300 },
      ],
    });
    const drawn = shapes(new SilhouetteMaskStrategy({ radius: 10 }).build(ctx));
    expect(drawn.every((d) => d.kind === 'roundRect')).toBe(true);
    expect(drawn).toHaveLength(2);
    expect(warn.mock.calls[0][0]).toContain('cross gap');
  });

  it('update() clears before redrawing, so a reshape does not stack rings', () => {
    const s = new SilhouetteMaskStrategy({ radius: 10 });
    const g = s.build(uniformCtx());
    s.update(g, pyramidCtx());
    const drawn = shapes(g);
    expect(drawn).toHaveLength(1);
    expect((drawn[0] as DrawnRing).points).toHaveLength(12);
  });
});

describe('PathMaskStrategy', () => {
  it('hands the graphics and the context straight to the callback', () => {
    const seen: MaskContext[] = [];
    const g = new PathMaskStrategy((gr, ctx) => {
      seen.push(ctx);
      gr.rect(1, 2, ctx.width, ctx.height).fill({ color: 0xffffff });
    }).build(uniformCtx());
    expect(seen[0].axis.mainProp).toBe('y');
    expect(shapes(g)).toEqual([{ kind: 'rect', x: 1, y: 2, width: 300, height: 300 }]);
  });

  it('rejects a non-function rather than failing at first draw', () => {
    // @ts-expect-error deliberately wrong, this is the plain-JS caller's mistake
    expect(() => new PathMaskStrategy({})).toThrow(/function/);
  });
});

describe('inset', () => {
  it('shrinks a rect-based strategy on all four sides', () => {
    const g = inset(new RectMaskStrategy(), 5).build(uniformCtx());
    expect(shapes(g)[1]).toEqual({ kind: 'rect', x: 105, y: 5, width: 90, height: 290 });
  });

  it('moves as well as resizes a strategy that draws from the viewport box', () => {
    const g = inset(new SharedRectMaskStrategy(), 6).build(uniformCtx());
    expect(shapes(g)).toEqual([{ kind: 'rect', x: 6, y: 6, width: 288, height: 288 }]);
  });

  it('grows on a negative inset', () => {
    const g = inset(new SharedRectMaskStrategy(), -4).build(uniformCtx());
    expect(shapes(g)).toEqual([{ kind: 'rect', x: -4, y: -4, width: 308, height: 308 }]);
  });

  it('composes with curve bleed instead of cancelling it', () => {
    const g = inset(new SharedRectMaskStrategy(), 5).build(uniformCtx({ bleed: 20 }));
    // Cross: inset 5 in from an edge already pushed out 20 -> -15.
    // Main: no bleed, so a plain 5.
    expect(shapes(g)).toEqual([{ kind: 'rect', x: -15, y: 5, width: 330, height: 290 }]);
  });

  it('insets the silhouette ring too', () => {
    const ring = shapes(
      inset(new SilhouetteMaskStrategy({ radius: 10 }), 5).build(uniformCtx()),
    )[0] as DrawnRing;
    expect(ring.points.map((p) => [p.x, p.y])).toEqual([
      [5, 5],
      [295, 5],
      [295, 295],
      [5, 295],
    ]);
  });

  it('rejects a non-finite inset', () => {
    expect(() => inset(new RectMaskStrategy(), Number.NaN)).toThrow(/finite/);
  });
});

describe('composeMasks', () => {
  it('unions every strategy into one Graphics', () => {
    const composed = composeMasks(
      new RectMaskStrategy(),
      new PathMaskStrategy((g, ctx) => {
        g.roundRect(0, -90, ctx.width, 70, 12).fill({ color: 0xffffff });
      }),
    );
    const drawn = shapes(composed.build(uniformCtx()));
    expect(drawn).toHaveLength(4);
    expect(drawn[3]).toEqual({
      kind: 'roundRect',
      x: 0,
      y: -90,
      width: 300,
      height: 70,
      radius: 12,
    });
  });

  it('nests a strategy that cannot draw into a foreign Graphics', () => {
    const legacy = {
      version: 2 as const,
      build: (ctx: MaskContext) => {
        const g = new Graphics();
        g.rect(0, 0, ctx.width, 10).fill({ color: 0xffffff });
        return g;
      },
      update: () => {},
    };
    expect(isDrawableMaskStrategy(legacy)).toBe(false);
    const g = composeMasks(new RectMaskStrategy(), legacy).build(uniformCtx());
    // Its own shapes are on the parent; the legacy one arrives as a child, which
    // a Pixi stencil mask renders as part of the same subtree.
    expect(shapes(g)).toHaveLength(3);
    expect(g.children).toHaveLength(1);
  });

  it('update() redraws rather than accumulating', () => {
    const composed = composeMasks(new RectMaskStrategy(), new RectMaskStrategy());
    const g = composed.build(uniformCtx());
    expect(shapes(g)).toHaveLength(6);
    composed.update(g, uniformCtx());
    expect(shapes(g)).toHaveLength(6);
  });

  it('rejects an empty composition', () => {
    expect(() => composeMasks()).toThrow(/at least one/);
  });
});

describe('RectMaskStrategy curve bleed', () => {
  it('inflates every reel rect on the cross axis (it used to ignore bleed)', () => {
    const drawn = shapes(new RectMaskStrategy().build(uniformCtx({ bleed: 12 })));
    expect(drawn[0]).toEqual({ kind: 'rect', x: -12, y: 0, width: 124, height: 300 });
    expect(drawn[2]).toEqual({ kind: 'rect', x: 188, y: 0, width: 124, height: 300 });
  });

  it('leaves the MAIN axis alone, so buffer cells stay hidden', () => {
    const drawn = shapes(new RectMaskStrategy().build(uniformCtx({ bleed: 12 }))) as DrawnRect[];
    expect(drawn.every((d) => d.y === 0 && d.height === 300)).toBe(true);
  });

  it('puts the bleed on Y for a horizontal set', () => {
    const ctx: MaskContext = {
      rects: [{ x: 0, y: 0, width: 300, height: 100 }],
      width: 300,
      height: 100,
      axis: reelAxis('horizontal', 'forward'),
      bleed: 12,
    };
    expect(shapes(new RectMaskStrategy().build(ctx))).toEqual([
      { kind: 'rect', x: 0, y: -12, width: 300, height: 124 },
    ]);
  });

  it('is a no-op at bleed 0, so existing sets are untouched', () => {
    expect(shapes(new RectMaskStrategy().build(uniformCtx()))).toEqual([
      { kind: 'rect', x: 0, y: 0, width: 100, height: 300 },
      { kind: 'rect', x: 100, y: 0, width: 100, height: 300 },
      { kind: 'rect', x: 200, y: 0, width: 100, height: 300 },
    ]);
  });
});

describe('composed masks do not accumulate scene nodes', () => {
  /** A strategy that only implements build/update, i.e. owns its Graphics. */
  class OwnGraphicsStrategy implements MaskStrategy {
    readonly version = MASK_STRATEGY_VERSION;
    build(): Graphics {
      const g = new Graphics();
      g.rect(0, 0, 10, 10).fill({ color: 0xffffff });
      return g;
    }
    update(g: Graphics): void {
      g.clear();
      g.rect(0, 0, 10, 10).fill({ color: 0xffffff });
    }
  }

  const ctx = (): MaskContext => uniformCtx();

  it('reuses the nested child across updates when wrapped in inset()', () => {
    // `Graphics.clear()` empties the path but keeps children, so a redraw that
    // called build() again would add one node per viewport resize and per
    // MultiWays reshape, for the life of the session.
    const strategy = composeMasks(inset(new OwnGraphicsStrategy(), 2));
    const g = strategy.build(ctx());
    const afterBuild = g.children.length;
    strategy.update(g, ctx());
    strategy.update(g, ctx());
    strategy.update(g, ctx());
    expect(g.children.length).toBe(afterBuild);
  });

  it('reuses the nested child for a bare non-drawable member too', () => {
    const strategy = composeMasks(new OwnGraphicsStrategy());
    const g = strategy.build(ctx());
    const afterBuild = g.children.length;
    strategy.update(g, ctx());
    strategy.update(g, ctx());
    expect(g.children.length).toBe(afterBuild);
  });
});
