import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';
import { debugSnapshot } from '../../src/debug/debug.js';

describe('per-reel static shape (pyramid)', () => {
  it('builds a 3-5-5-5-3 pyramid', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: [3, 5, 5, 5, 3],
      symbolIds: ['a', 'b'],
    });
    try {
      const reels = reelSet.reels;
      expect(reels.map((r) => r.visibleRows)).toEqual([3, 5, 5, 5, 3]);
      // Snapshot reflects per-reel rows.
      const snap = debugSnapshot(reelSet);
      expect(snap.visibleRows).toEqual([3, 5, 5, 5, 3]);
    } finally {
      destroy();
    }
  });

  it('default reelAnchor=center positions short reels with offset', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: [3, 5, 5, 5, 3],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      const reels = reelSet.reels;
      // Tallest box = 500. Short reel (3 rows × 100) = 300; centered → 100.
      expect(reels[0].offsetY).toBeCloseTo(100);
      expect(reels[1].offsetY).toBeCloseTo(0);
      expect(reels[2].offsetY).toBeCloseTo(0);
      expect(reels[4].offsetY).toBeCloseTo(100);
    } finally {
      destroy();
    }
  });

  it('getCellBounds accounts for offsetY on short reels', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: [3, 5, 3],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      // Short reel 0: offsetY=100 (centered inside tallest=500).
      const b0 = reelSet.getCellBounds(0, 0);
      expect(b0.y).toBeCloseTo(100);
      // Tall reel 1: offsetY=0.
      const b1 = reelSet.getCellBounds(1, 0);
      expect(b1.y).toBeCloseTo(0);
    } finally {
      destroy();
    }
  });

  it('lands per-reel symbols correctly on a pyramid grid', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: [3, 5, 5, 5, 3],
      symbolIds: ['a', 'b'],
    });
    try {
      const target: string[][] = [
        ['a', 'a', 'a'],
        ['b', 'b', 'b', 'b', 'b'],
        ['a', 'a', 'a', 'a', 'a'],
        ['b', 'b', 'b', 'b', 'b'],
        ['a', 'a', 'a'],
      ];
      await spinAndLand(target);
      expectGrid(reelSet, target);
    } finally {
      destroy();
    }
  });

  it('throws when visibleRowsPerReel length mismatches reelCount', () => {
    expect(() =>
      createTestReelSet({ reels: 5, visibleRows: [3, 5, 5] }),
    ).toThrow(/visibleRowsPerReel length 3 must equal reels\(5\)/);
  });
});
