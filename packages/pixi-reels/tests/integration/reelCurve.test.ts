/**
 * Reel curvature, end to end through a real ReelSet.
 *
 * The unit suite proves the projection; this proves the WIRING - that the
 * builder reaches the motion layer, that the bend survives a spin and a
 * landing, and above all that it never disturbs the flat coordinates the engine
 * reads back out of a view to work out which slot a symbol is in.
 *
 * Symbols here are `HeadlessSymbol`s, which take the base-class affine fit
 * rather than the `PerspectiveMesh` path. That is deliberate: it is the harness
 * that has no textures, and the fallback is the behaviour every Spine and
 * composite symbol gets, so it is worth pinning.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { ReelSet } from '../../src/core/ReelSet.js';

const CELL = { width: 100, height: 100 };

/** Where a symbol's flat cell centre actually renders. */
function renderedCentre(set: ReelSet, reel: number, index: number): { x: number; y: number } {
  const view = set.reels[reel].symbols[index].view;
  return {
    x: view.x + (CELL.width / 2 - view.pivot.x) * view.scale.x,
    y: view.y + (CELL.height / 2 - view.pivot.y) * view.scale.y,
  };
}

const scaleOf = (set: ReelSet, reel: number, index: number): number =>
  set.reels[reel].symbols[index].view.scale.y;

describe('reel curvature', () => {
  it('is off by default. a set with no curve() carries no curve at all', () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL });
    try {
      for (const reel of h.reelSet.reels) {
        expect(reel.curve).toBeUndefined();
        for (const symbol of reel.symbols) {
          expect(symbol.view.scale.y).toBe(1);
          expect(symbol.view.pivot.y).toBe(0);
        }
      }
    } finally {
      h.destroy();
    }
  });

  it('curve(0) stays flat rather than building a degenerate curve', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0,
    });
    try {
      expect(h.reelSet.reels[0].curve).toBeUndefined();
    } finally {
      h.destroy();
    }
  });

  it('projects a real trapezoid per cell, not a scaled rectangle', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.7,
    });
    try {
      const curve = h.reelSet.reels[0].curve;
      expect(curve).toBeDefined();
      const top = curve?.quadFor(0);
      if (!top) throw new Error('expected a quad');
      const nearWidth = Math.hypot(top.x1 - top.x0, top.y1 - top.y0);
      const farWidth = Math.hypot(top.x2 - top.x3, top.y2 - top.y3);
      // The whole point: within one cell the two edges differ. No scale can do
      // that. The far-from-camera edge (the top of the top cell) is narrower.
      expect(nearWidth).toBeLessThan(farWidth - 1);
    } finally {
      h.destroy();
    }
  });

  it('scales the fallback UNIFORMLY, so art that does not fill its cell is never distorted', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.7,
    });
    try {
      for (const symbol of h.reelSet.reels[0].symbols) {
        expect(symbol.view.scale.x).toBeCloseTo(symbol.view.scale.y, 9);
      }
    } finally {
      h.destroy();
    }
  });

  it('magnifies the cell facing you and shrinks the ones turning away', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.5,
    });
    try {
      const buffer = h.reelSet.reels[0].bufferStart;
      const top = scaleOf(h.reelSet, 0, buffer);
      const middle = scaleOf(h.reelSet, 0, buffer + 1);
      const bottom = scaleOf(h.reelSet, 0, buffer + 2);
      expect(middle).toBeGreaterThan(top);
      expect(middle).toBeGreaterThan(bottom);
      expect(top).toBeCloseTo(bottom, 6);
    } finally {
      h.destroy();
    }
  });

  it('leaves the cell facing the camera undeformed, at 1:1', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.9,
    });
    try {
      const curve = h.reelSet.reels[0].curve;
      const centre = (3 * CELL.height) / 2;
      // Dead centre, and 1:1 through it - the cell that is not turned away
      // must look untouched however hard the rest of the drum is bent.
      expect(curve?.mapMain(centre)).toBeCloseTo(centre, 6);
      const mag =
        ((curve?.mapMain(centre + 0.25) ?? 0) - (curve?.mapMain(centre - 0.25) ?? 0)) / 0.5;
      expect(mag).toBeCloseTo(1, 4);
      // The middle symbol still sits dead centre.
      const buffer = h.reelSet.reels[0].bufferStart;
      expect(renderedCentre(h.reelSet, 0, buffer + 1).y).toBeCloseTo(1.5 * CELL.height, 6);
    } finally {
      h.destroy();
    }
  });

  it('leaves the flat coordinate the engine reads back untouched', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.7,
    });
    try {
      const reel = h.reelSet.reels[0];
      // `view.y` is what `Reel` uses to recover a slot. It must stay on the
      // flat grid however hard the reel is bent, or every round trip through
      // it would compound the projection.
      for (let i = 0; i < reel.symbols.length; i++) {
        expect(reel.symbols[i].view.y).toBeCloseTo((i - reel.bufferStart) * CELL.height, 6);
      }
    } finally {
      h.destroy();
    }
  });

  it('lands the requested grid and stays projected afterwards', async () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'], symbolSize: CELL, curve: 0.5,
    });
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['b', 'c', 'a'] },
        { visible: ['c', 'a', 'b'] },
      ]);
      expect(h.reelSet.getVisibleGrid()).toEqual([
        ['a', 'b', 'c'],
        ['b', 'c', 'a'],
        ['c', 'a', 'b'],
      ]);
      const buffer = h.reelSet.reels[0].bufferStart;
      expect(scaleOf(h.reelSet, 0, buffer + 1)).toBeGreaterThan(scaleOf(h.reelSet, 0, buffer));
    } finally {
      h.destroy();
    }
  });

  it('curves each reel on its own with curvePerReel', () => {
    const h = createTestReelSet({
      reels: 3,
      visibleCells: 3,
      symbolIds: ['a'],
      symbolSize: CELL,
      curvePerReel: [0, 0.4, 0.8],
    });
    try {
      expect(h.reelSet.reels[0].curve).toBeUndefined();
      const buffer = h.reelSet.reels[1].bufferStart;
      const flat = scaleOf(h.reelSet, 0, buffer);
      const mild = scaleOf(h.reelSet, 1, buffer);
      const deep = scaleOf(h.reelSet, 2, buffer);
      expect(flat).toBe(1);
      expect(mild).toBeLessThan(flat);
      expect(deep).toBeLessThan(mild);
    } finally {
      h.destroy();
    }
  });

  it('rejects a per-reel array of the wrong length at build time', () => {
    expect(() =>
      createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a'], curvePerReel: [0.2, 0.4] }),
    ).toThrow(/curvePerReel/);
  });

  it('reports the projected cell from getCellBounds so paylines follow the curve', () => {
    const flatSet = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL,
    });
    const curved = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.5,
    });
    try {
      // Flat is unchanged by the feature.
      expect(flatSet.reelSet.getCellBounds(1, 0)).toEqual({
        x: 100, y: 0, width: 100, height: 100,
      });
      const top = curved.reelSet.getCellBounds(1, 0);
      const middle = curved.reelSet.getCellBounds(1, 1);
      // A trapezoid's bounding box: shorter than a flat cell at the window
      // edge, and essentially the flat cell in the middle, which faces the
      // camera and is drawn at 1:1.
      expect(top.height).toBeLessThan(middle.height * 0.85);
      expect(middle.height).toBeLessThanOrEqual(100 + 1e-6);
      expect(middle.height).toBeGreaterThan(94);
      // The rect tracks the symbol it is meant to outline.
      const buffer = curved.reelSet.reels[1].bufferStart;
      expect(top.y + top.height / 2).toBeCloseTo(renderedCentre(curved.reelSet, 1, buffer).y, 6);
      expect(middle.y + middle.height / 2).toBeCloseTo(
        renderedCentre(curved.reelSet, 1, buffer + 1).y,
        6,
      );
      // And it stays centred on the reel column.
      expect(top.x + top.width / 2).toBeCloseTo(150, 6);
    } finally {
      flatSet.destroy();
      curved.destroy();
    }
  });

  it('getCellQuad exposes the drawn trapezoid, and null when flat', () => {
    const flatSet = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL,
    });
    const curved = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.6,
    });
    try {
      expect(flatSet.reelSet.getCellQuad(1, 0)).toBeNull();
      const q = curved.reelSet.getCellQuad(1, 0);
      if (!q) throw new Error('expected a quad');
      expect(q).toHaveLength(4);
      // Same cell, so the quad must sit inside the bounding box the rect API
      // reports - that is what makes the two safe to mix in one overlay.
      const b = curved.reelSet.getCellBounds(1, 0);
      for (const p of q) {
        expect(p.x).toBeGreaterThanOrEqual(b.x - 1e-6);
        expect(p.x).toBeLessThanOrEqual(b.x + b.width + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(b.y - 1e-6);
        expect(p.y).toBeLessThanOrEqual(b.y + b.height + 1e-6);
      }
      // And it is a real trapezoid: the top edge is narrower than the bottom.
      expect(q[1].x - q[0].x).toBeLessThan(q[2].x - q[3].x);
    } finally {
      flatSet.destroy();
      curved.destroy();
    }
  });

  it('setCurve re-projects at runtime and flattens back cleanly', () => {
    const h = createTestReelSet({
      reels: 3, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL,
    });
    try {
      const buffer = h.reelSet.reels[0].bufferStart;
      expect(scaleOf(h.reelSet, 0, buffer)).toBe(1);

      h.reelSet.setCurve(0.6);
      expect(scaleOf(h.reelSet, 0, buffer)).toBeLessThan(1);

      h.reelSet.setCurve(0);
      for (const reel of h.reelSet.reels) {
        expect(reel.curve).toBeUndefined();
        for (const symbol of reel.symbols) {
          expect(symbol.view.scale.y).toBe(1);
          expect(symbol.view.pivot.y).toBe(0);
        }
      }
    } finally {
      h.destroy();
    }
  });

  it('setCurve rejects a per-reel array of the wrong length', () => {
    const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a'] });
    try {
      expect(() => h.reelSet.setCurve([0.1, 0.2])).toThrow(/reel count/);
    } finally {
      h.destroy();
    }
  });

  it("curveFocus('reel') keeps every reel its own drum", () => {
    const h = createTestReelSet({
      reels: 5, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.6,
    });
    try {
      // Each reel converges on its own centreline, so every reel is identical.
      for (const reel of h.reelSet.reels) {
        expect(reel.curve?.focusCross).toBeCloseTo(CELL.width / 2, 6);
      }
      const outer = h.reelSet.reels[0].curve?.quadFor(0);
      if (!outer) throw new Error('expected a quad');
      // Symmetric about the reel's own centre: no lean.
      expect((outer.x0 + outer.x1) / 2).toBeCloseTo(CELL.width / 2, 6);
      expect((outer.x2 + outer.x3) / 2).toBeCloseTo(CELL.width / 2, 6);
    } finally {
      h.destroy();
    }
  });

  it("curveFocus('set') leans receding cells toward the middle of the board", () => {
    const h = createTestReelSet({
      reels: 5,
      visibleCells: 3,
      symbolIds: ['a'],
      symbolSize: CELL,
      curve: 0.6,
      curveFocus: 'set',
    });
    try {
      // Reel 0 sits two columns left of centre, so its camera is off to the
      // right in its own coordinates; the middle reel's is dead ahead.
      expect(h.reelSet.reels[0].curve?.focusCross).toBeCloseTo(2.5 * CELL.width, 6);
      expect(h.reelSet.reels[2].curve?.focusCross).toBeCloseTo(CELL.width / 2, 6);
      expect(h.reelSet.reels[4].curve?.focusCross).toBeCloseTo(-1.5 * CELL.width, 6);

      // The top cell of the LEFT reel leans right (toward the board's centre).
      const left = h.reelSet.reels[0].curve?.quadFor(0);
      if (!left) throw new Error('expected a quad');
      expect((left.x0 + left.x1) / 2).toBeGreaterThan(CELL.width / 2);
      // The right reel leans the other way, by the same amount.
      const right = h.reelSet.reels[4].curve?.quadFor(0);
      if (!right) throw new Error('expected a quad');
      expect((right.x0 + right.x1) / 2).toBeLessThan(CELL.width / 2);
      expect((left.x0 + left.x1) / 2 - CELL.width / 2).toBeCloseTo(
        CELL.width / 2 - (right.x0 + right.x1) / 2,
        6,
      );
      // The centre reel does not lean at all.
      const middle = h.reelSet.reels[2].curve?.quadFor(0);
      if (!middle) throw new Error('expected a quad');
      expect((middle.x0 + middle.x1) / 2).toBeCloseTo(CELL.width / 2, 6);
    } finally {
      h.destroy();
    }
  });

  it("curveFocus('set-lean') leans exactly half as far as 'set'", () => {
    const full = createTestReelSet({
      reels: 5, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.6, curveFocus: 'set',
    });
    const half = createTestReelSet({
      reels: 5, visibleCells: 3, symbolIds: ['a'], symbolSize: CELL, curve: 0.6,
      curveFocus: 'set-lean',
    });
    try {
      const centre = CELL.width / 2;
      const leanOf = (h: typeof full): number => {
        const q = h.reelSet.reels[0].curve?.quadFor(0);
        if (!q) throw new Error('expected a quad');
        return (q.x0 + q.x1) / 2 - centre;
      };
      expect(leanOf(half)).toBeCloseTo(leanOf(full) / 2, 6);
      expect(half.reelSet.reels[0].curve?.focusCross).toBeCloseTo(
        (centre + (full.reelSet.reels[0].curve?.focusCross ?? 0)) / 2,
        6,
      );
    } finally {
      full.destroy();
      half.destroy();
    }
  });

  it('rejects an unknown focus by name', () => {
    expect(() =>
      createTestReelSet({
        reels: 3, visibleCells: 3, symbolIds: ['a'],
        curve: 0.5,
        curveFocus: 'middle' as never,
      }),
    ).toThrow(/curveFocus/);
  });

  it('projects along X on a horizontal set, because that is where travel is', () => {
    const h = createTestReelSet({
      reels: 3,
      visibleCells: 3,
      symbolIds: ['a'],
      symbolSize: CELL,
      orientation: 'horizontal',
      curve: 0.5,
    });
    try {
      const curve = h.reelSet.reels[0].curve;
      const first = curve?.quadFor(0);
      if (!first) throw new Error('expected a quad');
      // Travel is X, so the keystone is on the left/right edges: corners 0 and
      // 3 share an x, and that near edge is the short one.
      expect(first.x0).toBeCloseTo(first.x3, 6);
      const nearHeight = Math.hypot(first.x3 - first.x0, first.y3 - first.y0);
      const farHeight = Math.hypot(first.x2 - first.x1, first.y2 - first.y1);
      expect(nearHeight).toBeLessThan(farHeight);
    } finally {
      h.destroy();
    }
  });
});
