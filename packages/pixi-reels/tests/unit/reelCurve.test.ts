import { describe, it, expect } from 'vitest';
import { ReelCurve, resolveCurveConfig } from '../../src/core/ReelCurve.js';
import { reelAxis, VERTICAL_FORWARD } from '../../src/core/ReelAxis.js';
import type { ReelCellQuad } from '../../src/config/types.js';

const CELL = 100;
const CELLS = 3;
const MAX_ARC = 1.0; // must track ReelCurve's own constant

function build(amount: number, depth?: number, gap = 0, axis = VERTICAL_FORWARD): ReelCurve {
  const curve = new ReelCurve(resolveCurveConfig({ amount, depth }), axis);
  curve.setGeometry(CELL, CELL, CELL + gap, CELLS);
  return curve;
}

/** Where cell `i`'s leading edge sits with no curve at all. */
const flatStart = (i: number, gap = 0): number => i * (CELL + gap);

const quad = (curve: ReelCurve, i: number): ReelCellQuad => {
  const q = curve.quadFor(flatStart(i));
  if (!q) throw new Error('expected a projected quad');
  return q;
};

/** Width of the quad's near (smaller main coordinate) and far edges. */
const nearWidth = (q: ReelCellQuad): number => Math.hypot(q.x1 - q.x0, q.y1 - q.y0);
const farWidth = (q: ReelCellQuad): number => Math.hypot(q.x2 - q.x3, q.y2 - q.y3);

describe('resolveCurveConfig', () => {
  it('accepts the number shorthand', () => {
    expect(resolveCurveConfig(0.4).amount).toBe(0.4);
  });

  it('derives depth from amount when omitted', () => {
    expect(resolveCurveConfig(0.4).depth).toBeCloseTo(0.2);
    expect(resolveCurveConfig({ amount: 0.4, depth: 0.3 }).depth).toBe(0.3);
  });

  it('clamps out-of-range and non-finite input instead of producing NaN geometry', () => {
    expect(resolveCurveConfig(-3).amount).toBe(0);
    expect(resolveCurveConfig(7).amount).toBe(1);
    expect(resolveCurveConfig(Number.NaN).amount).toBe(0);
    expect(resolveCurveConfig({ amount: 0.5, depth: -1 }).depth).toBe(0);
  });

  it('holds depth below the fold-over limit, which tightens as amount grows', () => {
    // Past `cos(arc)` the projection stops being monotonic and cells at the
    // window edge reverse; the resolver must never hand that out.
    for (const amount of [0.25, 0.5, 0.75, 1]) {
      const resolved = resolveCurveConfig({ amount, depth: 1 });
      expect(resolved.depth).toBeLessThan(Math.cos(amount * MAX_ARC));
    }
    // A deep curve therefore cannot get the full depth it asked for.
    expect(resolveCurveConfig({ amount: 1, depth: 1 }).depth).toBeLessThan(1);
    // A shallow one is unaffected.
    expect(resolveCurveConfig({ amount: 0.3, depth: 0.15 }).depth).toBe(0.15);
  });
});

describe('ReelCurve projection', () => {
  it('amount 0 projects nothing at all, so a flat reel stays on the cheap path', () => {
    const curve = build(0);
    expect(curve.isFlat).toBe(true);
    expect(curve.quadFor(flatStart(0))).toBeNull();
    expect(curve.mapMain(150)).toBe(150);
    expect(curve.scaleAt(150)).toBe(1);
  });

  it('pins the window edges so N visible cells still fill the window exactly', () => {
    for (const amount of [0.2, 0.5, 0.8, 1]) {
      const curve = build(amount);
      expect(curve.mapMain(0)).toBeCloseTo(0, 6);
      expect(curve.mapMain(CELLS * CELL)).toBeCloseTo(CELLS * CELL, 6);
    }
  });

  it('leaves the window centre fixed and is symmetric about it', () => {
    const curve = build(0.6);
    const centre = (CELLS * CELL) / 2;
    expect(curve.mapMain(centre)).toBeCloseTo(centre, 6);
    for (const d of [10, 60, 140, 190]) {
      expect(curve.mapMain(centre + d) - centre).toBeCloseTo(centre - curve.mapMain(centre - d), 6);
    }
  });

  it('recedes toward the window edges: full size in the middle, smaller at the ends', () => {
    const curve = build(0.6, 0.3);
    const centre = (CELLS * CELL) / 2;
    expect(curve.scaleAt(centre)).toBeCloseTo(1, 6);
    expect(curve.scaleAt(0)).toBeCloseTo(1 / 1.3, 6);
    expect(curve.scaleAt(CELLS * CELL)).toBeCloseTo(1 / 1.3, 6);
    // Beyond the window it keeps receding. Holding it at the edge value gave
    // every buffer cell two equal edges, i.e. no keystone at all.
    expect(curve.scaleAt(-3 * CELL)).toBeLessThan(curve.scaleAt(0));
  });

  it('stays strictly increasing across the buffers, so cells can never fold over', () => {
    for (const amount of [0.25, 0.5, 0.75, 1]) {
      const curve = build(amount, 1); // depth 1 is clamped to the fold limit
      let previous = Number.NEGATIVE_INFINITY;
      for (let m = -2 * CELL; m <= (CELLS + 2) * CELL; m += 5) {
        const mapped = curve.mapMain(m);
        expect(mapped).toBeGreaterThan(previous);
        previous = mapped;
      }
    }
  });

  it('measures the window from the art, not the pitch, when there is a gap', () => {
    const gapped = build(0.6, 0.2, 20);
    // Window = 3 cells of art + 2 gaps = 340, so its centre is at 170.
    expect(gapped.mapMain(170)).toBeCloseTo(170, 6);
    expect(gapped.mapMain(0)).toBeCloseTo(0, 6);
    expect(gapped.mapMain(340)).toBeCloseTo(340, 6);
  });
});

describe('ReelCurve.quadFor', () => {
  it('keystones each cell: the edge rotated further away is narrower', () => {
    const curve = build(0.7, 0.35);
    const top = quad(curve, 0);
    const bottom = quad(curve, 2);
    // Top cell: its TOP edge has rotated furthest away, so it is the narrow one.
    expect(nearWidth(top)).toBeLessThan(farWidth(top));
    // Bottom cell is the mirror image.
    expect(farWidth(bottom)).toBeLessThan(nearWidth(bottom));
    // And the two outer cells keystone by the same amount.
    expect(nearWidth(top)).toBeCloseTo(farWidth(bottom), 6);
  });

  it('leaves the middle cell square-on: a rectangle, and the widest of the three', () => {
    const curve = build(0.7, 0.35);
    const middle = quad(curve, 1);
    // Symmetric about the camera axis, so its two edges match: no keystone.
    expect(nearWidth(middle)).toBeCloseTo(farWidth(middle), 6);
    // Not quite the full cell, and correctly so: only the drum's exact centre
    // LINE faces the camera square-on, and this cell's edges are already a
    // third of the way toward the window edge.
    expect(nearWidth(middle)).toBeLessThan(CELL);
    expect(nearWidth(middle)).toBeGreaterThan(nearWidth(quad(curve, 0)));
    expect(nearWidth(middle)).toBeGreaterThan(farWidth(quad(curve, 2)));
  });

  it('is a real trapezoid, not a scaled rectangle', () => {
    // The distinguishing property: within ONE cell the two edges differ. A
    // scale can only ever produce two equal edges.
    const top = quad(build(0.7, 0.35), 0);
    expect(Math.abs(nearWidth(top) - farWidth(top))).toBeGreaterThan(1);
  });

  it('magnifies the cell facing you and shortens the ones turning away', () => {
    const curve = build(0.6, 0.3);
    const height = (i: number) => quad(curve, i).y3 - quad(curve, i).y0;
    expect(height(1)).toBeGreaterThan(CELL);
    expect(height(0)).toBeLessThan(CELL);
    expect(height(0)).toBeCloseTo(height(2), 6);
  });

  it('cells tile exactly. no seam and no overlap between neighbours', () => {
    const curve = build(1, 1);
    for (let i = 0; i < CELLS - 1; i++) {
      const above = quad(curve, i);
      const below = quad(curve, i + 1);
      // Quads are view-local, so re-anchor to reel-local before comparing.
      expect(flatStart(i) + above.y3).toBeCloseTo(flatStart(i + 1) + below.y0, 9);
      expect(farWidth(above)).toBeCloseTo(nearWidth(below), 9);
    }
  });

  it('keystones buffer cells too, instead of flattening them to rectangles', () => {
    const curve = build(0.7, 0.35);
    // One cell above the window: the cell that peeks in over the top edge.
    const peeking = curve.quadFor(-CELL);
    if (!peeking) throw new Error('expected a projected quad');
    // Its top edge has rotated FURTHER away than its bottom, so it must still
    // be the narrower of the two. Pinning the scale outside the window made
    // these equal, i.e. a flat rectangle beside a hard-curved neighbour.
    expect(nearWidth(peeking)).toBeLessThan(farWidth(peeking) - 0.5);
    // And it is narrower than the visible cell below it, not wider.
    expect(farWidth(peeking)).toBeLessThanOrEqual(nearWidth(quad(curve, 0)) + 1e-6);

    const trailing = curve.quadFor(CELLS * CELL);
    if (!trailing) throw new Error('expected a projected quad');
    expect(farWidth(trailing)).toBeLessThan(nearWidth(trailing) - 0.5);
  });

  it('keeps shrinking past the window rather than holding at the edge', () => {
    const curve = build(0.7, 0.35);
    const edge = curve.scaleAt(0);
    const oneOut = curve.scaleAt(-CELL);
    const twoOut = curve.scaleAt(-2 * CELL);
    expect(oneOut).toBeLessThan(edge);
    expect(twoOut).toBeLessThan(oneOut);
  });

  it('centres every cell on the reel centreline', () => {
    const curve = build(0.7, 0.35);
    for (let i = 0; i < CELLS; i++) {
      const q = quad(curve, i);
      expect((q.x0 + q.x1) / 2).toBeCloseTo(CELL / 2, 6);
      expect((q.x2 + q.x3) / 2).toBeCloseTo(CELL / 2, 6);
    }
  });

  it('reports the flat cell box it replaces', () => {
    const q = quad(build(0.5), 0);
    expect(q.width).toBe(CELL);
    expect(q.height).toBe(CELL);
  });

  it('emits corners clockwise from screen top-left in both orientations', () => {
    // The contract PerspectiveMesh needs: corner 0 is the texture's top-left,
    // and 0->1->2->3 walks the quad clockwise on screen. On a keystoned quad
    // corners 0 and 1 do NOT share a coordinate, so assert the walk instead.
    const vertical = quad(build(0.7, 0.35), 0);
    // Travel is Y: the near (top) edge carries corners 0 and 1, left then right.
    expect(vertical.y0).toBeCloseTo(vertical.y1, 6);
    expect(vertical.y2).toBeCloseTo(vertical.y3, 6);
    expect(vertical.x0).toBeLessThan(vertical.x1);
    expect(vertical.x3).toBeLessThan(vertical.x2);
    expect(vertical.y3).toBeGreaterThan(vertical.y0);

    const horizontal = quad(build(0.7, 0.35, 0, reelAxis('horizontal', 'forward')), 0);
    // Travel is X: the near (left) edge now carries corners 0 and 3, top then
    // bottom, so the art still reads upright and the texture's top-left lands
    // on the screen's top-left.
    expect(horizontal.x0).toBeCloseTo(horizontal.x3, 6);
    expect(horizontal.x1).toBeCloseTo(horizontal.x2, 6);
    expect(horizontal.y0).toBeLessThan(horizontal.y3);
    expect(horizontal.y1).toBeLessThan(horizontal.y2);
    expect(horizontal.x1).toBeGreaterThan(horizontal.x0);
  });

  it('re-binds to a reshaped window', () => {
    const curve = build(0.6);
    curve.setGeometry(60, 60, 60, 5);
    expect(curve.mapMain((5 * 60) / 2)).toBeCloseTo((5 * 60) / 2, 6);
    expect(curve.mapMain(5 * 60)).toBeCloseTo(5 * 60, 6);
    expect(quad(curve, 0).width).toBe(60);
  });
});
