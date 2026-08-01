/**
 * Horizontal orientation (uniform grids). A single horizontal reel is the
 * banner that replaces the old HorizontalReel subtree: cells march along X, the
 * strip travels on X, and it spins + lands through the same lifecycle as a
 * vertical reel. Non-square symbols (120x80) make an axis swap observable.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

const SIZE = { width: 120, height: 80 };

describe('horizontal orientation', () => {
  it('a single horizontal reel (banner) spins and lands, cells along X', async () => {
    const h = createTestReelSet({
      reels: 1,
      visibleCells: 5,
      symbolIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      orientation: 'horizontal',
      symbolSize: SIZE,
    });
    try {
      const grid = [['a', 'b', 'c', 'd', 'e']];
      await h.spinAndLand(grid);
      expect(h.reelSet.getVisibleGrid()).toEqual(grid);

      const reel = h.reelSet.reels[0];
      expect(reel.axis.orientation).toBe('horizontal');
      expect(reel.axis.mainProp).toBe('x');

      // Cells march along X (main), share Y (cross); each is 120x80 screen.
      const c0 = h.reelSet.getCellBounds(0, 0);
      const c1 = h.reelSet.getCellBounds(0, 1);
      expect(c0.width).toBe(120);
      expect(c0.height).toBe(80);
      expect(c1.y).toBe(c0.y);
      expect(c1.x - c0.x).toBeCloseTo(120, 5); // one main pitch (symbolWidth + 0 gap)
    } finally {
      h.destroy();
    }
  });

  it('a vertical control with the same non-square cells marches along Y', () => {
    const h = createTestReelSet({ reels: 1, visibleCells: 3, symbolIds: ['a', 'b'], symbolSize: SIZE });
    try {
      const c0 = h.reelSet.getCellBounds(0, 0);
      const c1 = h.reelSet.getCellBounds(0, 1);
      expect(c1.x).toBe(c0.x); // same cross (x)
      expect(c1.y - c0.y).toBeCloseTo(80, 5); // one main pitch (symbolHeight)
    } finally {
      h.destroy();
    }
  });

  it('horizontal + MultiWays fails loud (uniform only)', () => {
    const b = new ReelSetBuilder()
      .reels(3)
      .symbolSize(120, 80)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .orientation('horizontal')
      .multiways({ minRows: 2, maxRows: 5, reelPixelHeight: 400 });
    expect(() => b.build()).toThrow(/uniform/);
  });
});
