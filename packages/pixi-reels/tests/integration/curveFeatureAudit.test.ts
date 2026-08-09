/**
 * Curvature x every other feature.
 *
 * The curve reaches into placement, the render loop, the mask and the geometry
 * API, so it can collide with anything that also moves a symbol or reads a
 * cell's position. This suite is the audit: one case per feature, asserting
 * what actually happens rather than what the docs hope for. Cases that FAIL
 * here are real interaction bugs and are named as such.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const CELL = { width: 100, height: 100 };

const base = {
  reels: 5,
  visibleCells: 3,
  symbolIds: ['a', 'b', 'c'],
  symbolSize: CELL,
} as const;

describe('curvature x big symbols', () => {
  it('projects a 2x2 block through the curve rather than the flat grid', async () => {
    const h = createTestReelSet({
      ...base,
      symbolIds: ['a', 'b', 'big'],
      symbolData: { big: { size: { reels: 2, cells: 2 } } },
      curve: 0.5,
    });
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'a'] },
        { visible: ['big', 'a', 'b'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['b', 'b', 'b'] },
        { visible: ['a', 'b', 'a'] },
      ]);
      const block = h.reelSet.getBlockBounds(1, 0);
      const flat = createTestReelSet({
        ...base,
        symbolIds: ['a', 'b', 'big'],
        symbolData: { big: { size: { reels: 2, cells: 2 } } },
      });
      try {
        await flat.spinAndLand([
          { visible: ['a', 'b', 'a'] },
          { visible: ['big', 'a', 'b'] },
          { visible: ['a', 'a', 'a'] },
          { visible: ['b', 'b', 'b'] },
          { visible: ['a', 'b', 'a'] },
        ]);
        const flatBlock = flat.reelSet.getBlockBounds(1, 0);
        // A 2-cell-tall block straddling the drum's top half must come out
        // SHORTER than flat, or the block API is reporting the flat grid.
        expect(block.height).toBeLessThan(flatBlock.height);
        expect(block.width).toBeLessThanOrEqual(flatBlock.width);
      } finally {
        flat.destroy();
      }
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x MultiWays reshape', () => {
  it('re-binds the curve to the new window so the middle cell stays 1:1', () => {
    const h = createTestReelSet({
      reels: 5,
      symbolIds: ['a', 'b'],
      symbolSize: CELL,
      multiways: { minCells: 2, maxCells: 5, reelExtent: 500 },
      curve: 0.5,
    });
    try {
      const reel = h.reelSet.reels[0];
      h.reelSet.setShape([3, 3, 3, 3, 3]);
      const curve = reel.curve;
      const centre = reel.extent / 2;
      expect(curve?.mapMain(centre)).toBeCloseTo(centre, 6);
      const mag =
        ((curve?.mapMain(centre + 0.25) ?? 0) - (curve?.mapMain(centre - 0.25) ?? 0)) / 0.5;
      expect(mag).toBeCloseTo(1, 3);
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x unmask', () => {
  it('an unmasked symbol lifted out of the reel still lands on the curve', async () => {
    const h = createTestReelSet({
      ...base,
      symbolIds: ['a', 'b', 'scatter'],
      symbolData: { scatter: { unmask: true } },
      curve: 0.6,
    });
    try {
      await h.spinAndLand([
        { visible: ['scatter', 'a', 'b'] },
        { visible: ['a', 'b', 'a'] },
        { visible: ['b', 'a', 'b'] },
        { visible: ['a', 'b', 'a'] },
        { visible: ['b', 'a', 'b'] },
      ]);
      const reel = h.reelSet.reels[0];
      const lifted = reel.symbols[reel.bufferStart];
      expect(lifted.symbolId).toBe('scatter');
      // Lifted into the viewport's unmasked container, so its coordinate is
      // viewport-space; the curve must still have been applied to it.
      expect(lifted.view.scale.y).not.toBe(1);
      // And it must sit where the curve puts cell 0, not where flat would.
      const bounds = h.reelSet.getCellBounds(0, 0);
      const drawnTop = lifted.view.y - lifted.view.pivot.y * lifted.view.scale.y;
      expect(drawnTop).toBeCloseTo(bounds.y, 3);
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x cascade', () => {
  it('survives a tumble: refilled cells come back on the curve', async () => {
    const h = createTestReelSet({
      ...base,
      tumble: {},
      bufferSymbols: { start: 3, end: 0 },
      curve: 0.5,
    });
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['b', 'c', 'a'] },
        { visible: ['c', 'a', 'b'] },
        { visible: ['a', 'b', 'c'] },
        { visible: ['b', 'c', 'a'] },
      ]);
      const reel = h.reelSet.reels[0];
      const buffer = reel.bufferStart;
      const middle = reel.symbols[buffer + 1].view.scale.y;
      const top = reel.symbols[buffer].view.scale.y;
      expect(middle).toBeGreaterThan(top);
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x pins', () => {
  it('a pinned cell reports curved bounds, so overlays track it', () => {
    const h = createTestReelSet({ ...base, curve: 0.5 });
    try {
      h.reelSet.pin(2, 0, 'c', { turns: 3 });
      const top = h.reelSet.getCellBounds(2, 0);
      const middle = h.reelSet.getCellBounds(2, 1);
      expect(top.height).toBeLessThan(middle.height);
      const quad = h.reelSet.getCellQuad(2, 0);
      expect(quad).not.toBeNull();
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x jagged / pyramid shapes', () => {
  it('gives each reel its own drum sized to its own window', () => {
    const h = createTestReelSet({
      reels: 5,
      visibleCells: [3, 4, 5, 4, 3],
      symbolIds: ['a', 'b'],
      symbolSize: CELL,
      curve: 0.5,
    });
    try {
      // Each reel's centre must be 1:1 against ITS window, not a shared one.
      for (const reel of h.reelSet.reels) {
        const centre = reel.extent / 2;
        const c = reel.curve;
        const mag = ((c?.mapMain(centre + 0.25) ?? 0) - (c?.mapMain(centre - 0.25) ?? 0)) / 0.5;
        expect(mag).toBeCloseTo(1, 3);
      }
      // A 5-cell reel bends its outer cells harder than a 3-cell one, because
      // the same arc is spread over more cells.
      const shallow = h.reelSet.getCellBounds(0, 0).height;
      const deep = h.reelSet.getCellBounds(2, 0).height;
      expect(deep).toBeLessThan(shallow);
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x horizontal orientation', () => {
  it('bends along X and leaves the cross axis to the perspective', () => {
    const h = createTestReelSet({
      ...base,
      orientation: 'horizontal',
      curve: 0.5,
    });
    try {
      const q = h.reelSet.reels[0].curve?.quadFor(0);
      if (!q) throw new Error('expected a quad');
      expect(q.x0).toBeCloseTo(q.x3, 6);
      const nearH = Math.hypot(q.x3 - q.x0, q.y3 - q.y0);
      const farH = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
      expect(nearH).toBeLessThan(farH);
    } finally {
      h.destroy();
    }
  });
});

describe('curvature x symbol pools (main #204)', () => {
  it('pools still decide WHAT spawns; the curve only decides where it is drawn', async () => {
    const h = createTestReelSet({ ...base, curve: 0.5 });
    try {
      h.reelSet.randomSymbols.set({ exclude: ['c'] });
      await h.spinAndLand([
        { visible: ['a', 'b', 'a'] },
        { visible: ['b', 'a', 'b'] },
        { visible: ['a', 'b', 'a'] },
        { visible: ['b', 'a', 'b'] },
        { visible: ['a', 'b', 'a'] },
      ]);
      for (const reel of h.reelSet.reels) {
        for (let i = 0; i < reel.symbols.length; i++) {
          if (reel.symbols[i].symbolId === '') continue;
          if (i >= reel.bufferStart && i < reel.bufferStart + reel.visibleCells) continue;
          expect(reel.symbols[i].symbolId).not.toBe('c');
        }
      }
    } finally {
      h.destroy();
    }
  });
});
