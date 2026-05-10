/**
 * Integration tests for the auto-zIndex contract on `_replaceSymbol`.
 *
 * Contract: when a symbol is activated into a row (via any code path that
 * funnels into `_replaceSymbol` — wrap callback, `placeSymbols`, etc.), its
 * view's zIndex is set to the canonical formula
 *   `(symbolData.zIndex ?? 0) * 100 + arrayIndex`
 * automatically. Consumers should not need to call `refreshZIndex()`
 * explicitly after a single in-place swap.
 *
 * This guards against regressions where the activate path falls back to
 * `view.zIndex = 0`, which was a long-standing footgun: a wild registered
 * with `zIndex: 5` would render *under* its neighbours until the next
 * motion-wrap or snap re-ran `refreshZIndex` over the whole reel.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'wild', 'b'];

describe('auto-zIndex on _replaceSymbol', () => {
  it('a newly-placed symbol gets the canonical zIndex without an explicit refresh', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
      symbolData: {
        wild: { zIndex: 5 },
      },
    });
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);

      const reel = h.reelSet.reels[1];
      const bufferAbove = reel.bufferAbove;
      const wildArrayIndex = bufferAbove + 1; // visible row 1
      const wildView = reel.symbols[wildArrayIndex].view;

      // Canonical formula: (symbolData.zIndex ?? 0) * 100 + arrayIndex
      expect(wildView.zIndex).toBe(5 * 100 + wildArrayIndex);
    } finally {
      h.destroy();
    }
  });

  it('a symbol with no zIndex override uses the builder default (1) plus arrayIndex', async () => {
    // Builder defaults `symbolData.zIndex` to 1 for every registered symbol
    // when no override is provided; auto-zIndex on activate must respect
    // that default, not silently land symbols on layer 0.
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
    });
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);

      const reel = h.reelSet.reels[0];
      const bufferAbove = reel.bufferAbove;

      for (let row = 0; row < 3; row++) {
        const arrayIndex = bufferAbove + row;
        const view = reel.symbols[arrayIndex].view;
        expect(view.zIndex).toBe(1 * 100 + arrayIndex);
      }
    } finally {
      h.destroy();
    }
  });

  it('zIndex is reapplied even when the same symbol id replaces itself', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
      symbolData: {
        wild: { zIndex: 7 },
      },
    });
    try {
      // First spin: wild lands.
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);
      // Manually corrupt the zIndex so we can verify the swap re-applies it.
      const reel = h.reelSet.reels[1];
      const bufferAbove = reel.bufferAbove;
      const wildArrayIndex = bufferAbove + 1;
      reel.symbols[wildArrayIndex].view.zIndex = -999;

      // Second spin: wild lands at the same row again (same symbol id swap).
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);

      const wildView = reel.symbols[wildArrayIndex].view;
      expect(wildView.zIndex).toBe(7 * 100 + wildArrayIndex);
    } finally {
      h.destroy();
    }
  });
});
