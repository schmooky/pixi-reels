/**
 * Big symbols on a reel that TRAVELS REVERSE.
 *
 * The existing big-symbol coverage is direction-blind: `bigSymbols.test.ts`
 * only ever varies `nudge({ direction })` (a per-call travel option, not the
 * reel's axis), and `stackingAndGuards.test.ts` covers the `directionPerReel`
 * throw plus geometric stacking on the default forward axis. Nothing laid a
 * multi-cell block out on a reel whose axis polarity is -1.
 *
 * That combination is worth its own file because the two halves pull in
 * opposite directions by design:
 *
 *   - Block layout is GEOMETRIC. `_finalizeFrame` scans the strip by array
 *     index, and the strip stays ordered by screen position (index 0 = smallest
 *     main coordinate) in every direction. So a landed block must be laid out
 *     identically forward and reverse.
 *   - The stop FEED is directional. `feedEdge` flips to 'end' on a reverse
 *     reel, so `StopSequencer` hands the frame back head-first instead of
 *     end-first. For a 1xH block that means the ANCHOR wraps in before its
 *     OCCUPIED stubs, the exact opposite of the forward order.
 *
 * The assertions below pin the first property while deliberately routing
 * through the second.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { TestReelSetHandle } from '../../src/testing/testHarness.js';

const OCC = '__pixi_reels_occupied__';
const CELL_W = 120;
const CELL_H = 100;

type Direction = 'forward' | 'reverse';

function makeTall(direction: Direction, reels = 1) {
  return createTestReelSet({
    reels,
    visibleCells: 3,
    bufferSymbols: 2,
    direction,
    symbolIds: ['a', 'tall'],
    symbolSize: { width: CELL_W, height: CELL_H },
    symbolData: { tall: { weight: 0, size: { reels: 1, cells: 3 } } },
  });
}

/** Strip ids plus each symbol's main coordinate, the direction-invariant shape. */
function stripLayout(h: TestReelSetHandle, reelIndex = 0) {
  const reel = h.reelSet.reels[reelIndex];
  return reel.symbols.map((s) => ({ id: s.symbolId, y: Math.round(s.view.y * 1000) / 1000 }));
}

describe('big symbols on a reverse-travelling reel', () => {
  it('lays a 1x3 block out identically forward and reverse', async () => {
    const f = makeTall('forward');
    const r = makeTall('reverse');
    try {
      const grid = [{ visible: ['tall', 'X', 'Y'] }];
      await f.spinAndLand(grid);
      await r.spinAndLand(grid);

      // Both report the block across all three visible cells.
      expect(f.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'tall', 'tall']);
      expect(r.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'tall', 'tall']);

      // Anchor at strip[2] (bufferStart=2), stubs at [3..4], in BOTH.
      const rIds = r.reelSet.reels[0].symbols.map((s) => s.symbolId);
      expect(rIds[2]).toBe('tall');
      expect(rIds[3]).toBe(OCC);
      expect(rIds[4]).toBe(OCC);

      // And the geometry matches cell for cell, not merely "is also a block".
      expect(stripLayout(r)).toEqual(stripLayout(f));
    } finally {
      f.destroy();
      r.destroy();
    }
  });

  it('sizes the anchor view to span the block on a reverse reel', async () => {
    const r = makeTall('reverse');
    try {
      await r.spinAndLand([{ visible: ['tall', 'X', 'Y'] }]);
      // `resize()` is what `_finalizeFrame` calls to span the block, and
      // HeadlessSymbol records those args (its view is an empty Container, so
      // `view.height` is always 0 and would assert nothing).
      const anchor = r.reelSet.reels[0].symbols[2] as HeadlessSymbol;
      // 3 cells tall, 1 reel wide. An anchor left at 1x1, or one sized on the
      // cross axis instead, is the failure this catches.
      expect(anchor.height).toBeCloseTo(3 * CELL_H, 3);
      expect(anchor.width).toBeCloseTo(CELL_W, 3);
      expect(r.reelSet.getSymbolFootprint(0, 1)).toEqual({
        anchor: { reel: 0, cell: 0 },
        size: { reels: 1, cells: 3 },
      });
    } finally {
      r.destroy();
    }
  });

  it('keeps a bufferStart-anchored block tail-visible on a reverse reel', async () => {
    // Anchor parked at bufferStart[1] = cell -2, so only the block's last cell
    // shows. Scan 2 of `_finalizeFrame` owns this case, and it walks the strip
    // toward larger indices -- which is the EXIT edge on a reverse reel, not
    // the feed edge.
    const f = makeTall('forward');
    const r = makeTall('reverse');
    try {
      const grid = [{ visible: ['a', 'a', 'a'], bufferStart: [undefined, 'tall'] }];
      await f.spinAndLand(grid);
      await r.spinAndLand(grid);

      expect(r.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'a', 'a']);
      expect(r.reelSet.getSymbolFootprint(0, 0)).toEqual({
        anchor: { reel: 0, cell: -2 },
        size: { reels: 1, cells: 3 },
      });
      expect(stripLayout(r)).toEqual(stripLayout(f));
    } finally {
      f.destroy();
      r.destroy();
    }
  });

  it('lands a 2x2 cross-reel block on a reverse set', async () => {
    const r = createTestReelSet({
      reels: 5,
      visibleCells: 3,
      direction: 'reverse',
      symbolIds: ['a', 'bonus'],
      symbolSize: { width: CELL_W, height: CELL_H },
      symbolData: { bonus: { weight: 0, size: { reels: 2, cells: 2 } } },
    });
    try {
      await r.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['bonus', 'X', 'a'] },
        { visible: ['Y', 'Z', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);
      const grid = r.reelSet.getVisibleGrid();
      expect(grid[2][0]).toBe('bonus');
      expect(grid[2][1]).toBe('bonus');
      expect(grid[3][0]).toBe('bonus');
      expect(grid[3][1]).toBe('bonus');
      expect(grid[4][0]).toBe('a');
    } finally {
      r.destroy();
    }
  });

  it('mixed directionPerReel lands a block on the reversed reel only', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleCells: 3,
      bufferSymbols: 2,
      directionPerReel: ['forward', 'reverse', 'forward'],
      symbolIds: ['a', 'tall'],
      symbolSize: { width: CELL_W, height: CELL_H },
      symbolData: { tall: { weight: 0, size: { reels: 1, cells: 3 } } },
    });
    try {
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['tall', 'X', 'Y'] },
        { visible: ['a', 'a', 'a'] },
      ]);
      expect(h.reelSet.getVisibleGrid()[1]).toEqual(['tall', 'tall', 'tall']);
      const ids = h.reelSet.reels[1].symbols.map((s) => s.symbolId);
      expect(ids[2]).toBe('tall');
      expect(ids[3]).toBe(OCC);
      expect(ids[4]).toBe(OCC);
    } finally {
      h.destroy();
    }
  });

  /**
   * The natural stop is the case the geometric assertions above cannot reach:
   * `spinAndLand` calls `slamStop()`, which places the frame directly and never
   * runs the sequencer. Only here does the reverse feed edge actually hand the
   * anchor back before its stubs.
   *
   * Clock trick from `reverseNaturalStop.test.ts`: GSAP runs on real wall time
   * while the strip advances on FakeTicker pumps.
   */
  async function pumpUntil<T>(h: TestReelSetHandle, promise: Promise<T>): Promise<T> {
    let settled = false;
    const tracked = promise.finally(() => { settled = true; });
    const started = Date.now();
    while (!settled && Date.now() - started < 8000) {
      h.advance(16);
      await new Promise((res) => setTimeout(res, 4));
    }
    return tracked;
  }

  it('feeds a 1x3 block through the reverse stop sequencer anchor-first and still lands it', async () => {
    const r = makeTall('reverse');
    try {
      const spin = r.reelSet.spin();
      r.advance(200);
      r.reelSet.setResult([{ visible: ['tall', 'X', 'Y'] }]);
      const result = await pumpUntil(r, spin);

      expect(result.wasSkipped).toBe(false);
      expect(r.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'tall', 'tall']);
      const ids = r.reelSet.reels[0].symbols.map((s) => s.symbolId);
      expect(ids[2]).toBe('tall');
      expect(ids[3]).toBe(OCC);
      expect(ids[4]).toBe(OCC);
      // The anchor must still span the block after a real landing, not just
      // after the direct placement `slamStop` does.
      const anchor = r.reelSet.reels[0].symbols[2] as HeadlessSymbol;
      expect(anchor.height).toBeCloseTo(3 * CELL_H, 3);
    } finally {
      r.destroy();
    }
  }, 20000);

  it('lands the same block a forward set does, through the same natural path', async () => {
    const f = makeTall('forward');
    const r = makeTall('reverse');
    try {
      const fSpin = f.reelSet.spin();
      f.advance(200);
      f.reelSet.setResult([{ visible: ['tall', 'X', 'Y'] }]);
      await pumpUntil(f, fSpin);

      const rSpin = r.reelSet.spin();
      r.advance(200);
      r.reelSet.setResult([{ visible: ['tall', 'X', 'Y'] }]);
      await pumpUntil(r, rSpin);

      expect(r.reelSet.getVisibleGrid()).toEqual(f.reelSet.getVisibleGrid());
      expect(stripLayout(r)).toEqual(stripLayout(f));
    } finally {
      f.destroy();
      r.destroy();
    }
  }, 20000);
});
