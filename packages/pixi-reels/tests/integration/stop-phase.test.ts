/**
 * Regression: StopPhase previously passed the full frame (buffers + visible)
 * to Reel.placeSymbols, which expects visible-only. This caused the top
 * visible cell to occasionally land on a random buffer symbol instead of the
 * target - not caught by spinAndLand (which uses skip()), but visible in real
 * spins. We can't test the full async GSAP path in Node, but we can assert the
 * two landing entry points directly: `placeSymbols` (visible-relative
 * ColumnTarget) and `placeStrip` (the full strip frame StopPhase now lands).
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';

describe('reel landing entry points', () => {
  it('placeSymbols fills every visible cell from the column target', () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const grid = [
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ];
      for (let r = 0; r < 3; r++) {
        h.reelSet.reels[r].placeSymbols({ visible: grid[r] });
      }
      expectGrid(h.reelSet, grid);
    } finally {
      h.destroy();
    }
  });

  it('placeStrip lands a full strip frame at the right visible offset', () => {
    const h = createTestReelSet({ reels: 1, visibleCells: 3, symbolIds: ['a', 'b', 'c', 'buf'] });
    try {
      const reel = h.reelSet.reels[0];
      const fullFrame = ['buf', 'a', 'b', 'c', 'buf'];
      expect(reel.symbols.length).toBe(fullFrame.length);
      reel.placeStrip(fullFrame);
      expect(reel.getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('placeSymbols lands buffer targets either side of the visible window', () => {
    const h = createTestReelSet({ reels: 1, visibleCells: 3, symbolIds: ['a', 'b', 'c', 'buf'] });
    try {
      const reel = h.reelSet.reels[0];
      reel.placeSymbols({
        visible: ['a', 'b', 'c'],
        bufferStart: ['buf'],
        bufferEnd: ['buf'],
      });
      expect(reel.getVisibleSymbols()).toEqual(['a', 'b', 'c']);
      expect(reel.symbols[0].symbolId).toBe('buf');
      expect(reel.symbols[reel.symbols.length - 1].symbolId).toBe('buf');
    } finally {
      h.destroy();
    }
  });
});
