/**
 * Regression: StopPhase previously passed the full frame (buffers + visible)
 * to Reel.placeSymbols, which expects visible-only. This caused the top
 * visible row to occasionally land on a random buffer symbol instead of the
 * target — not caught by spinAndLand (which uses skip()), but visible in real
 * spins. We can't test the full async GSAP path in Node, but we can assert
 * placeSymbols behavior directly plus the slice semantics StopPhase now uses.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';

describe('placeSymbols visible-only semantics', () => {
  it('placing visible-only grid fills every visible cell with target', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const grid = [
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ];
      for (let r = 0; r < 3; r++) {
        h.reelSet.reels[r].placeSymbols(grid[r]);
      }
      expectGrid(h.reelSet, grid);
    } finally {
      h.destroy();
    }
  });

  it('slicing a full frame produces the correct visible portion', () => {
    const h = createTestReelSet({ reels: 1, visibleRows: 3, symbolIds: ['a', 'b', 'c', 'buf'] });
    try {
      const reel = h.reelSet.reels[0];
      const total = reel.symbols.length;
      const visible = reel.getVisibleSymbols().length;
      const bufferAbove = Math.floor((total - visible) / 2);
      const fullFrame = ['buf', 'a', 'b', 'c', 'buf'];
      const sliced = fullFrame.slice(bufferAbove, bufferAbove + visible);
      expect(sliced).toEqual(['a', 'b', 'c']);
      reel.placeSymbols(sliced);
      expect(reel.getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });
});
