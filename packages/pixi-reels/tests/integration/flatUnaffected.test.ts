import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

describe('a set with no curve()', () => {
  it('carries no curve, no warp, and leaves every symbol transform at identity', async () => {
    const h = createTestReelSet({
      reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      for (const reel of h.reelSet.reels) {
        expect(reel.curve).toBeUndefined();
        for (const s of reel.symbols) {
          expect(s.view.scale.x).toBe(1);
          expect(s.view.scale.y).toBe(1);
          expect(s.view.pivot.x).toBe(0);
          expect(s.view.pivot.y).toBe(0);
        }
      }
      expect(h.reelSet.getCellQuad(2, 1)).toBeNull();
      expect(h.reelSet.getCellBounds(2, 1)).toEqual({ x: 200, y: 100, width: 100, height: 100 });

      // ...and still so after a real spin lands.
      await h.spinAndLand(Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] })));
      for (const reel of h.reelSet.reels) {
        for (const s of reel.symbols) {
          expect(s.view.scale.y).toBe(1);
          expect(s.view.pivot.y).toBe(0);
        }
      }
    } finally {
      h.destroy();
    }
  });

  it('curveMode/renderer without curve() still builds nothing', () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a'], curveFocus: 'set' });
    try {
      for (const reel of h.reelSet.reels) expect(reel.curve).toBeUndefined();
    } finally {
      h.destroy();
    }
  });
});
