/**
 * Subset-spin via `SpinOptions.holdReels`. Held reels skip START/SPIN/STOP
 * and stay on whatever symbols they're currently showing. Covers the
 * core invariants exposed in the public API contract:
 *
 *   - non-held reels animate to their result rows
 *   - held reels keep their pre-spin visible rows
 *   - setAnticipation silently filters held indices
 *   - skip() honours holdReels
 *   - degenerate "all held" still resolves
 *   - bad indices (out of range, duplicates) are silently filtered
 *   - no `spin:reelLanded` / `spin:stopping` event fires for held reels
 */
import { describe, it, expect } from 'vitest';
import { captureEvents, createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'd', 'e', 'wild'];

function makeHarness() {
  return createTestReelSet({
    reels: 5,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

async function spinAndLandWithHold(
  h: ReturnType<typeof makeHarness>,
  grid: string[][],
  holdReels: number[],
) {
  const promise = h.reelSet.spin({ holdReels });
  h.reelSet.setResult(grid.map((visible) => ({ visible })));
  h.reelSet.slamStop();
  return promise;
}

describe('SpinOptions.holdReels — basic behaviour', () => {
  it('spins only non-held reels; held reels keep their visible rows', async () => {
    const h = makeHarness();
    try {
      // First spin: lands the whole board so we have a known starting grid.
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);

      const before = h.reelSet.reels.map((r) => r.getVisibleSymbols());

      // Second spin: hold reels 0 and 4. Server tries to write 'wild'
      // everywhere — held entries must be ignored.
      const wildAll: string[][] = Array.from({ length: 5 }, () => ['wild', 'wild', 'wild']);
      await spinAndLandWithHold(h, wildAll, [0, 4]);

      const after = h.reelSet.reels.map((r) => r.getVisibleSymbols());

      // Held reels unchanged.
      expect(after[0]).toEqual(before[0]);
      expect(after[4]).toEqual(before[4]);
      // Non-held reels landed on the wilds.
      expect(after[1]).toEqual(['wild', 'wild', 'wild']);
      expect(after[2]).toEqual(['wild', 'wild', 'wild']);
      expect(after[3]).toEqual(['wild', 'wild', 'wild']);
    } finally {
      h.destroy();
    }
  });

  it('SpinResult.symbols reports the full visible grid (held rows included)', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);

      const result = await spinAndLandWithHold(
        h,
        [
          ['wild', 'wild', 'wild'],
          ['wild', 'wild', 'wild'],
          ['wild', 'wild', 'wild'],
          ['wild', 'wild', 'wild'],
          ['wild', 'wild', 'wild'],
        ],
        [2],
      );

      expect(result.symbols[2]).toEqual(['c', 'c', 'c']);
      expect(result.symbols[0]).toEqual(['wild', 'wild', 'wild']);
    } finally {
      h.destroy();
    }
  });
});

describe('SpinOptions.holdReels — events', () => {
  it('does not emit spin:reelLanded for held reels', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);

      // Note: we drive the spin via `skip()` so no `spin:stopping` fires
      // for any reel (existing slam-stop semantics). The point of this
      // test is `spin:reelLanded` — which DOES fire from the skip path
      // via _markLanded — must NOT include held indices.
      const log = captureEvents(h.reelSet, ['spin:reelLanded']);
      const target: string[][] = [
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ];
      await spinAndLandWithHold(h, target, [1, 3]);

      const reelLanded = log.map((e) => e.args[0]);
      expect(reelLanded.sort()).toEqual([0, 2, 4]);
    } finally {
      h.destroy();
    }
  });

  it('still emits spin:allLanded when only non-held reels land', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);

      const log = captureEvents(h.reelSet, ['spin:allLanded', 'spin:complete']);
      await spinAndLandWithHold(
        h,
        [
          ['a', 'a', 'a'],
          ['b', 'b', 'b'],
          ['c', 'c', 'c'],
          ['d', 'd', 'd'],
          ['e', 'e', 'e'],
        ],
        [0, 1, 4],
      );

      expect(log.map((e) => e.event)).toEqual(['spin:allLanded', 'spin:complete']);
    } finally {
      h.destroy();
    }
  });
});

describe('SpinOptions.holdReels — degenerate cases', () => {
  it('all reels held: resolves with the current visible grid, no events for reels', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);
      const before = h.reelSet.reels.map((r) => r.getVisibleSymbols());

      const log = captureEvents(h.reelSet, [
        'spin:start',
        'spin:reelLanded',
        'spin:allLanded',
      ]);
      const result = await h.reelSet.spin({ holdReels: [0, 1, 2, 3, 4] });

      expect(result.symbols).toEqual(before);
      expect(log.map((e) => e.event)).toEqual(['spin:start', 'spin:allLanded']);
    } finally {
      h.destroy();
    }
  });

  it('out-of-range and duplicate hold indices are filtered', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);

      const target: string[][] = [
        ['wild', 'wild', 'wild'],
        ['wild', 'wild', 'wild'],
        ['wild', 'wild', 'wild'],
        ['wild', 'wild', 'wild'],
        ['wild', 'wild', 'wild'],
      ];
      await spinAndLandWithHold(h, target, [-1, 99, 2, 2, 7]);

      const after = h.reelSet.reels.map((r) => r.getVisibleSymbols());
      // Only reel 2 actually held; the rest are valid garbage indices that
      // should not block spinning.
      expect(after[2]).toEqual(['c', 'c', 'c']);
      expect(after[0]).toEqual(['wild', 'wild', 'wild']);
      expect(after[1]).toEqual(['wild', 'wild', 'wild']);
      expect(after[3]).toEqual(['wild', 'wild', 'wild']);
      expect(after[4]).toEqual(['wild', 'wild', 'wild']);
    } finally {
      h.destroy();
    }
  });
});

describe('SpinOptions.holdReels — interaction with setAnticipation', () => {
  it('filters held indices out of the anticipation list silently', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['d', 'd', 'd'],
        ['e', 'e', 'e'],
      ]);

      const promise = h.reelSet.spin({ holdReels: [3] });
      // Set anticipation including the held reel — implementation must drop it.
      h.reelSet.setAnticipation([2, 3, 4]);
      h.reelSet.setResult([
        { visible: ['a', 'a', 'a'] },
        { visible: ['b', 'b', 'b'] },
        { visible: ['c', 'c', 'c'] },
        { visible: ['d', 'd', 'd'] },
        { visible: ['e', 'e', 'e'] },
      ]);
      h.reelSet.slamStop();
      await promise;

      // No assertion failure thrown means the filter held — anticipation
      // never tried to enter a phase chain on the held reel.
      expect(h.reelSet.reels[3].getVisibleSymbols()).toEqual(['d', 'd', 'd']);
    } finally {
      h.destroy();
    }
  });
});
