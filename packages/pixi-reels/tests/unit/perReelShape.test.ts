import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';
import { debugSnapshot } from '../../src/debug/debug.js';

describe('per-reel static shape (pyramid)', () => {
  it('builds a 3-5-5-5-3 pyramid', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 5,
      visibleCells: [3, 5, 5, 5, 3],
      symbolIds: ['a', 'b'],
    });
    try {
      const reels = reelSet.reels;
      expect(reels.map((r) => r.visibleCells)).toEqual([3, 5, 5, 5, 3]);
      // Snapshot reflects per-reel cells.
      const snap = debugSnapshot(reelSet);
      expect(snap.visibleCells).toEqual([3, 5, 5, 5, 3]);
    } finally {
      destroy();
    }
  });

  it('default reelAnchor=center positions short reels with offset', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 5,
      visibleCells: [3, 5, 5, 5, 3],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      const reels = reelSet.reels;
      // Tallest box = 500. Short reel (3 cells x 100) = 300; centered -> 100.
      expect(reels[0].mainOffset).toBeCloseTo(100);
      expect(reels[1].mainOffset).toBeCloseTo(0);
      expect(reels[2].mainOffset).toBeCloseTo(0);
      expect(reels[4].mainOffset).toBeCloseTo(100);
    } finally {
      destroy();
    }
  });

  it('getCellBounds accounts for mainOffset on short reels', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      visibleCells: [3, 5, 3],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      // Short reel 0: mainOffset=100 (centered inside tallest=500).
      const b0 = reelSet.getCellBounds(0, 0);
      expect(b0.y).toBeCloseTo(100);
      // Tall reel 1: mainOffset=0.
      const b1 = reelSet.getCellBounds(1, 0);
      expect(b1.y).toBeCloseTo(0);
    } finally {
      destroy();
    }
  });

  it('lands per-reel symbols correctly on a pyramid grid', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleCells: [3, 5, 5, 5, 3],
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

  it('throws when visibleCellsPerReel length mismatches reelCount', () => {
    expect(() =>
      createTestReelSet({ reels: 5, visibleCells: [3, 5, 5] }),
    ).toThrow(/visibleCellsPerReel length 3 must equal reels\(5\)/);
  });
});
