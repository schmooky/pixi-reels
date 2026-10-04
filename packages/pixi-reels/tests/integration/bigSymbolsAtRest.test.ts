/**
 * Big symbols placed at rest, outside a landing: the builder's
 * `initialFrame`, `addReels({ initialFrame })`, `pin()` and `movePin()`.
 *
 * Each went to the reels one column at a time, without the big-symbol
 * coordinator a landing runs. A 2x2 anchor got no stubs and drew over its
 * neighbours, and re-placing a reel that shared a block turned the block's
 * stubs into more anchors.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const OCC = '__pixi_reels_occupied__';
const IDS = ['a', 'b', 'c', 'filler', 'wild', 'big'];
const DATA = { big: { weight: 0, size: { reels: 2, cells: 2 } } };

const make = (initialFrame?: ColumnTarget[]) =>
  createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: IDS, symbolData: DATA, initialFrame });
/** A reel's visible window, straight off its strip (stubs included). */
const window = (h: ReturnType<typeof make>, r: number) => {
  const reel = h.reelSet.reels[r];
  return reel.symbols.slice(reel.bufferStart, reel.bufferStart + reel.visibleCells).map((s) => s.symbolId);
};
const anchors = (h: ReturnType<typeof make>) =>
  h.reelSet.reels.flatMap((reel) => reel.symbols).filter((s) => s.symbolId === 'big').length;
const BLOCK = [{ visible: ['big', 'big', 'a'] }, { visible: ['big', 'big', 'b'] }, { visible: ['a', 'b', 'c'] }];

describe('seeding a board', () => {
  it('builder initialFrame gives a big symbol its whole block', () => {
    const h = make([{ visible: ['big', 'a', 'b'] }, { visible: ['c', 'a', 'b'] }, { visible: ['a', 'b', 'c'] }]);
    try {
      expect(window(h, 0)).toEqual(['big', OCC, 'b']);
      expect(window(h, 1)).toEqual([OCC, OCC, 'b']);
      expect(h.reelSet.getVisibleGrid().slice(0, 2)).toEqual([['big', 'big', 'b'], ['big', 'big', 'b']]);
    } finally {
      h.destroy();
    }
  });

  it('builder initialFrame refuses a block that does not fit', () => {
    expect(() => make([{ visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] }, { visible: ['big', 'a', 'b'] }]))
      .toThrow(/big symbol 'big' \(2x2\) .* exceeds reel count 3/);
  });

  it('addReels initialFrame gives a big symbol its whole block on the new reels', () => {
    const h = make();
    try {
      h.reelSet.addReels(2, { initialFrame: [{ visible: ['big', 'a', 'b'] }, { visible: ['c', 'a', 'b'] }] });
      expect(window(h, 3)).toEqual(['big', OCC, 'b']);
      expect(window(h, 4)).toEqual([OCC, OCC, 'b']);
    } finally {
      h.destroy();
    }
  });

  it('addReels refuses a block reaching past the last new reel, before adding any', () => {
    const h = make();
    try {
      expect(() => h.reelSet.addReels(1, { initialFrame: [{ visible: ['big', 'a', 'b'] }] })).toThrow(/exceeds reel count 1/);
      expect(h.reelSet.reels).toHaveLength(3);
    } finally {
      h.destroy();
    }
  });
});

describe('pins at rest', () => {
  it('pinning a cell beside a block keeps the block whole', async () => {
    const h = make();
    try {
      await h.spinAndLand(BLOCK);
      h.reelSet.pin(0, 2, 'wild');
      h.reelSet.pin(1, 2, 'wild');
      expect(anchors(h)).toBe(1);
      expect(window(h, 0)).toEqual(['big', OCC, 'wild']);
      expect(window(h, 1)).toEqual([OCC, OCC, 'wild']);
    } finally {
      h.destroy();
    }
  });

  it('pinning a cell of a block replaces the block, so the pin shows', async () => {
    const h = make();
    try {
      await h.spinAndLand(BLOCK);
      h.reelSet.pin(1, 1, 'wild');
      expect(h.reelSet.getVisibleGrid()[1][1]).toBe('wild');
      expect(anchors(h)).toBe(0);
      expect(h.reelSet.reels.flatMap((reel) => reel.symbols).some((s) => s.symbolId === OCC)).toBe(false);
    } finally {
      h.destroy();
    }
  });

  it('movePin across reels that share a block keeps it whole', async () => {
    const h = make();
    try {
      await h.spinAndLand(BLOCK);
      h.reelSet.pin(0, 2, 'wild');
      await h.reelSet.movePin({ reel: 0, cell: 2 }, { reel: 1, cell: 2 }, { duration: 1, backfill: 'filler' });
      expect(anchors(h)).toBe(1);
      expect(window(h, 0)).toEqual(['big', OCC, 'filler']);
      expect(window(h, 1)).toEqual([OCC, OCC, 'wild']);
    } finally {
      h.destroy();
    }
  });

  it('refuses to pin a big symbol where its block does not fit', async () => {
    const h = make();
    try {
      await h.spinAndLand([{ visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] }]);
      expect(() => h.reelSet.pin(2, 0, 'big')).toThrow(/big symbol 'big' \(2x2\) at \(reel=2, cell=0\) exceeds reel count 3/);
      expect(h.reelSet.getPin(2, 0)).toBeUndefined();
    } finally {
      h.destroy();
    }
  });
});
