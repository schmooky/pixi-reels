import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';

describe('big symbols', () => {
  it('lands a 2x2 block, anchor row reports anchor id, OCCUPIED rows do too', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: 3,
      symbolIds: ['a', 'bonus'],
      symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
    });
    try {
      await spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['bonus', 'X', 'a'], // server places anchor; engine paints OCCUPIED
        ['Y', 'Z', 'a'],     // ignored — engine paints OCCUPIED
        ['a', 'a', 'a'],
      ]);
      // Same-reel resolution at the Reel level.
      const reel2 = reelSet.reels[2];
      expect(reel2.getVisibleSymbols()[0]).toBe('bonus'); // anchor
      expect(reel2.getVisibleSymbols()[1]).toBe('bonus'); // intra-reel OCCUPIED → anchor

      // Cross-reel resolution via the ReelSet API.
      const grid = reelSet.getVisibleGrid();
      expect(grid[2][0]).toBe('bonus');
      expect(grid[2][1]).toBe('bonus');
      expect(grid[3][0]).toBe('bonus'); // cross-reel OCCUPIED resolved
      expect(grid[3][1]).toBe('bonus');
      expect(grid[4][0]).toBe('a');
    } finally {
      destroy();
    }
  });

  it('getSymbolFootprint reports anchor + size for cells inside a 2x2 block', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: 3,
      symbolIds: ['a', 'bonus'],
      symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
    });
    try {
      await spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['bonus', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const fp = reelSet.getSymbolFootprint(2, 0);
      expect(fp).toEqual({ anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } });
      const fp2 = reelSet.getSymbolFootprint(3, 0);
      expect(fp2).toEqual({ anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } });
      const fp3 = reelSet.getSymbolFootprint(2, 1);
      expect(fp3).toEqual({ anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } });
      // Normal cell: 1×1 footprint at itself.
      const fp4 = reelSet.getSymbolFootprint(0, 0);
      expect(fp4).toEqual({ anchor: { col: 0, row: 0 }, size: { w: 1, h: 1 } });
    } finally {
      destroy();
    }
  });

  it('throws when block exceeds reel height', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'giant'],
      symbolData: { giant: { weight: 0, size: { w: 1, h: 4 } } },
    });
    try {
      const promise = reelSet.spin();
      expect(() => {
        reelSet.setResult([
          ['giant', 'a', 'a'],
          ['a', 'a', 'a'],
          ['a', 'a', 'a'],
        ]);
      }).toThrow(/exceeds reel/);
      reelSet.skip();
      await promise.catch(() => {});
    } finally {
      destroy();
    }
  });

  it('throws when block extends past last column', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'wide'],
      symbolData: { wide: { weight: 0, size: { w: 4, h: 1 } } },
    });
    try {
      const promise = reelSet.spin();
      expect(() => {
        reelSet.setResult([
          ['a', 'a', 'a'],
          ['a', 'a', 'a'],
          ['wide', 'a', 'a'],
        ]);
      }).toThrow(/exceeds reel count/);
      reelSet.skip();
      await promise.catch(() => {});
    } finally {
      destroy();
    }
  });

  it('rejects big-symbol registration on MultiWays slots at build()', () => {
    expect(() =>
      createTestReelSet({
        reels: 5,
        multiways: { minRows: 2, maxRows: 7, reelPixelHeight: 600 },
        symbolIds: ['a', 'bonus'],
        symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
      }),
    ).toThrow(/big symbol .* cannot be registered on a MultiWays slot/);
  });

  it('rejects big symbols with non-zero weight (random fill cannot place blocks)', () => {
    expect(() =>
      createTestReelSet({
        reels: 3,
        visibleRows: 3,
        symbolIds: ['a', 'bonus'],
        symbolData: { bonus: { weight: 5, size: { w: 2, h: 2 } } },
      }),
    ).toThrow(/big symbol .* must have weight 0/);
  });
});
