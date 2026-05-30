/**
 * REPRODUCTION (pre-fix) of two visual bugs in the big-symbol cascade-fall
 * recipe. The sibling `cascade-bigSymbol-fall.test.ts` asserts only logical
 * strip/occupancy/grid state and lands via slamStop, so it misses both:
 *
 *   Bug 1 — a bufferAbove-anchored block (tail visible at row 0) is DESTROYED
 *           by the animated tumble place path: CascadePlacePhase slices off
 *           the buffer cells, so the anchor is overwritten with a random
 *           symbol and the visible OCCUPIED stub renders empty.
 *
 *   Bug 2 — when the block lands fully visible, CascadeDropInPhase builds one
 *           drop job per visible row; the occupied rows resolve to the SAME
 *           anchor view, so the anchor's `view.y` ends at the wrong position
 *           (and, with real durations, multiple tweens fight → jitter).
 */
import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { OCCUPIED_SENTINEL } from '../../src/core/Reel.js';

function buildHarness() {
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

  // Land the initial state through the spin pipeline (slamStop) so the
  // coordinator paints OCCUPIED stubs and the anchor lands at strip[0].
  return {
    reelSet,
    ticker,
    destroy: () => { reelSet.destroy(); ticker.destroy(); },
  };
}

// Initial land matches the recipe: 1x3 wild tail-visible at row 0 (anchor in
// bufferAbove[1]), MATCH cluster at row 1.
async function landInitial(reelSet: ReturnType<typeof buildHarness>['reelSet']) {
  const spinDone = reelSet.spin();
  reelSet.setResult([
    { visible: ['a', 'match', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
    { visible: ['b', 'match', 'b', 'b'] },
    { visible: ['b', 'match', 'b', 'b'] },
  ]);
  reelSet.slamStop();
  await spinDone;
}

describe('big-symbol cascade-fall. visual/positional state (repro)', () => {
  it('BUG 2: anchor view.y is correct after the recipe refill (row-1 cluster clears, block falls to visible[0..2])', async () => {
    const { reelSet, destroy } = buildHarness();
    try {
      await landInitial(reelSet);

      // Recipe cascade: row-1 cluster wins, wild block drops to visible[0..2].
      await reelSet.refill({
        winners: [{ reel: 0, row: 1 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }],
        grid: [
          { visible: ['tall', 'a', 'a', 'a'], bufferAbove: ['a'] },
          { visible: ['b', 'b', 'b', 'b'] },
          { visible: ['b', 'b', 'b', 'b'] },
        ],
      });

      const reel0 = reelSet.reels[0];
      // Anchor moved to strip[2] (visible row 0).
      expect(reel0.symbols[2].symbolId).toBe('tall');
      const slotH = reel0.motion.slotHeight;
      // Visible row 0 sits at local Y = 0; a top-anchored 1x3 block's anchor
      // view must land exactly there. The duplicate-job bug leaves it at -slotH.
      expect(reel0.symbols[2].view.y).toBe(0 * slotH);
    } finally {
      destroy();
    }
  });

  it('BUG 1: a bufferAbove-anchored block survives the animated tumble place path', async () => {
    const { reelSet, destroy } = buildHarness();
    try {
      await landInitial(reelSet);

      // Refill that RE-LANDS the block tail-visible (anchor back in
      // bufferAbove[1], tail at row 0). This exercises CascadePlacePhase on
      // a buffer-anchored block exactly like the recipe's initial animated land.
      await reelSet.refill({
        winners: [{ reel: 0, row: 1 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }],
        grid: [
          { visible: ['a', 'a', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
          { visible: ['b', 'b', 'b', 'b'] },
          { visible: ['b', 'b', 'b', 'b'] },
        ],
      });

      const reel0 = reelSet.reels[0];
      // Anchor must still live at strip[0]; the visible tail (row 0) must
      // resolve to 'tall', not an empty OCCUPIED stub.
      expect(reel0.symbols[0].symbolId).toBe('tall');
      expect(reelSet.getVisibleGrid()[0][0]).toBe('tall');
      // Sanity: visible row 0 is an occupied cell of the block.
      expect(reel0.symbols[2].symbolId).toBe(OCCUPIED_SENTINEL);
    } finally {
      destroy();
    }
  });
});
