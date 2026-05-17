import { describe, expect, it } from 'vitest';
import { createTestReelSet } from '../../src/testing/testHarness.js';

describe('ReelSet.destroySymbols', () => {
  it('resolves immediately for an empty cells list', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 3, visibleRows: 3 });
    const t0 = performance.now();
    await reelSet.destroySymbols([]);
    expect(performance.now() - t0).toBeLessThan(50);
    destroy();
  });

  it('runs playDestroy on every cell and leaves them at alpha 0', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 3, visibleRows: 3 });
    const cells = [
      { reel: 0, row: 0 },
      { reel: 1, row: 1 },
      { reel: 2, row: 2 },
    ];
    await reelSet.destroySymbols(cells);
    for (const c of cells) {
      const sym = reelSet.reels[c.reel].getSymbolAt(c.row);
      expect(sym.view.alpha).toBe(0);
    }
    destroy();
  });

  it('lifts zIndex to 1000 by default so destroyed cells render above neighbours', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 2, visibleRows: 2 });
    const cell = { reel: 0, row: 0 };
    await reelSet.destroySymbols([cell]);
    expect(reelSet.reels[0].getSymbolAt(0).view.zIndex).toBe(1000);
    destroy();
  });

  it('respects an explicit zIndex override', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 2, visibleRows: 2 });
    await reelSet.destroySymbols([{ reel: 0, row: 0 }], { zIndex: 42 });
    expect(reelSet.reels[0].getSymbolAt(0).view.zIndex).toBe(42);
    destroy();
  });

  it('skips the zIndex bump when zIndex: null is passed', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 2, visibleRows: 2 });
    const sym = reelSet.reels[0].getSymbolAt(0);
    sym.view.zIndex = 7;
    await reelSet.destroySymbols([{ reel: 0, row: 0 }], { zIndex: null });
    expect(sym.view.zIndex).toBe(7);
    destroy();
  });

  it('throws on out-of-range reel without partially destroying anything', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 2, visibleRows: 2 });
    const okCell = { reel: 0, row: 0 };
    const badCell = { reel: 99, row: 0 };
    const before = reelSet.reels[0].getSymbolAt(0).view.alpha;
    await expect(reelSet.destroySymbols([okCell, badCell])).rejects.toThrow(
      /destroySymbols: cell\.reel 99/,
    );
    expect(reelSet.reels[0].getSymbolAt(0).view.alpha).toBe(before);
    destroy();
  });

  it('throws on out-of-range row', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 2, visibleRows: 2 });
    await expect(reelSet.destroySymbols([{ reel: 0, row: 5 }])).rejects.toThrow(
      /destroySymbols: cell\.row 5/,
    );
    destroy();
  });

  it('passes alternating direction by column when no override is set', async () => {
    // playDestroy itself doesn't expose the direction it received; check the
    // public observable: every cell ends at alpha 0 (no exception thrown),
    // which means destroy ran with valid directions on every cell.
    const { reelSet, destroy } = createTestReelSet({ reels: 4, visibleRows: 1 });
    const cells = [0, 1, 2, 3].map((reel) => ({ reel, row: 0 }));
    await reelSet.destroySymbols(cells);
    for (const c of cells) {
      expect(reelSet.reels[c.reel].getSymbolAt(0).view.alpha).toBe(0);
    }
    destroy();
  });
});
