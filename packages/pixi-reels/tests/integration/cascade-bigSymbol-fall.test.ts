/**
 * Cascade refill with a buffer-anchored big symbol.
 *
 * A 1×3 wild lands with its anchor in bufferAbove (tail visible at row 0).
 * A win-bearing row below the tail clears, and the `refill()` grid moves
 * the anchor to a fully-visible row. Asserts that `_coordinateBigSymbols`
 * runs on the refill path the same as on `setResult`, and that the moved
 * block's strip layout is correct post-refill.
 *
 * This is the recipe in /apps/site/src/recipes/big-symbol-cascade-fall.recipe.ts,
 * boiled down to a headless deterministic test.
 */
import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { OCCUPIED_SENTINEL } from '../../src/core/Reel.js';

// Headless tumble harness with the big-symbol-friendly setup. Builder
// `initialFrame` doesn't run `_coordinateBigSymbols`, so we land the
// initial state through a spin → setResult → slamStop pipeline (the
// same path `createTestReelSet.spinAndLand` uses, just inlined here
// because the shared harness doesn't expose tumble config).
function buildTumbleHarnessWithBigSymbol() {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleRows(4)
    .bufferSymbols(2)
    .symbolSize(50, 50)
    .symbols((r) => {
      for (const id of ['a', 'b', 'tall', 'match']) r.register(id, HeadlessSymbol, {});
    })
    .weights({ a: 1, b: 1, match: 1 })
    .symbolData({ tall: { weight: 0, size: { w: 1, h: 3 } } })
    .tumble({
      fall:   { duration: 0, ease: 'none', rowStagger: 0 },
      dropIn: { duration: 0, ease: 'none', rowStagger: 0, distance: 'perHole' },
    })
    .ticker(ticker as unknown as Ticker)
    .build();
  return {
    reelSet,
    ticker,
    destroy: () => { reelSet.destroy(); ticker.destroy(); },
  };
}

describe('cascade refill. buffer-anchored big symbol', () => {
  it('moves a 1x3 anchor from bufferAbove[1] to visible[0] via a one-step cascade refill', async () => {
    const { reelSet, destroy } = buildTumbleHarnessWithBigSymbol();
    try {
      // Land the initial state through the spin pipeline so
      // _coordinateBigSymbols paints OCCUPIED stubs.
      const spinDone = reelSet.spin();
      reelSet.setResult([
        // Reel 0: anchor at bufferAbove[1] = row -2. Block at rows -2, -1, 0.
        // Tail visible at row 0. Plant MATCH at row 1.
        { visible: ['a', 'match', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
        { visible: ['b', 'match', 'b', 'b'] },
        { visible: ['b', 'match', 'b', 'b'] },
      ]);
      reelSet.slamStop();
      await spinDone;

      // Sanity: initial state has the tall block tail-visible.
      const beforeGrid = reelSet.getVisibleGrid();
      expect(beforeGrid[0]).toEqual(['tall', 'match', 'a', 'a']);
      // Strip layout: anchor at strip[0], stubs at strip[1..2].
      expect(reelSet.reels[0].symbols[0].symbolId).toBe('tall');
      expect(reelSet.reels[0].symbols[1].symbolId).toBe(OCCUPIED_SENTINEL);
      expect(reelSet.reels[0].symbols[2].symbolId).toBe(OCCUPIED_SENTINEL);

      // Cascade refill: row-1 cluster wins, wild falls to visible[0..2].
      await reelSet.refill({
        winners: [
          { reel: 0, row: 1 },
          { reel: 1, row: 1 },
          { reel: 2, row: 1 },
        ],
        grid: [
          // Reel 0: anchor now at row 0 (fully visible). The coordinator
          // paints OCCUPIED at visible[1] and visible[2] from the
          // size.h = 3 metadata; the 'a' placeholders at those rows are
          // overwritten.
          { visible: ['tall', 'a', 'a', 'a'], bufferAbove: ['a'] },
          // Reels 1, 2: fresh fillers.
          { visible: ['b', 'b', 'b', 'b'] },
          { visible: ['b', 'b', 'b', 'b'] },
        ],
      });

      // Block now fully visible on reel 0.
      const afterGrid = reelSet.getVisibleGrid();
      expect(afterGrid[0]).toEqual(['tall', 'tall', 'tall', 'a']);

      // Strip layout post-refill:
      // bufferAbove(2) | visible(4) | bufferBelow(2). 8 cells.
      //   strip[0,1]   |  [2..5]    |  [6,7]
      // Anchor moved to strip[2] (visible[0]); stubs at strip[3..4].
      const reel0 = reelSet.reels[0];
      expect(reel0.symbols[2].symbolId).toBe('tall');
      expect(reel0.symbols[3].symbolId).toBe(OCCUPIED_SENTINEL);
      expect(reel0.symbols[4].symbolId).toBe(OCCUPIED_SENTINEL);
      // bufferBelow must NOT carry any block cell. the block stopped
      // at strip[4].
      expect(reel0.symbols[5].symbolId).not.toBe(OCCUPIED_SENTINEL);
      expect(reel0.symbols[5].symbolId).not.toBe('tall');

      // Footprint reports the anchor at its new visible row.
      const fp = reelSet.getSymbolFootprint(0, 0);
      expect(fp.anchor).toEqual({ col: 0, row: 0 });
      expect(fp.size).toEqual({ w: 1, h: 3 });
    } finally {
      destroy();
    }
  });

});
