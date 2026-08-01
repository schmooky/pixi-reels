import { describe, expect, it } from 'vitest';
import { computeDropOffsets } from '../../src/cascade/tumbleAlgorithm.js';

describe('computeDropOffsets', () => {
  describe('Moment A (initial drop)', () => {
    it('treats every visible row as a new symbol', () => {
      const offsets = computeDropOffsets(5, [], { initial: true });
      expect(offsets).toEqual([
        { row: 0, originalCell: -5, offsetCells: 5 },
        { row: 1, originalCell: -4, offsetCells: 5 },
        { row: 2, originalCell: -3, offsetCells: 5 },
        { row: 3, originalCell: -2, offsetCells: 5 },
        { row: 4, originalCell: -1, offsetCells: 5 },
      ]);
    });

    it('gives every symbol the same fall distance (visibleCells cells)', () => {
      const offsets = computeDropOffsets(7, [], { initial: true });
      const distances = offsets.map((o) => o.offsetCells);
      expect(distances).toEqual([7, 7, 7, 7, 7, 7, 7]);
    });

    it('stacks origins above the viewport so they form a vertical column', () => {
      const offsets = computeDropOffsets(4, [], { initial: true });
      // Each new symbol's virtual origin sits exactly (winCount - row) cells
      // above its target - so origins span -4..-1, the new column.
      const origins = offsets.map((o) => o.originalCell);
      expect(origins).toEqual([-4, -3, -2, -1]);
    });

    it('ignores winnerCells entirely when initial=true', () => {
      // Even with stale winnerCells passed by mistake, initial overrides:
      // every row is treated as new.
      const offsets = computeDropOffsets(3, [0, 2], { initial: true });
      expect(offsets.map((o) => o.offsetCells)).toEqual([3, 3, 3]);
    });
  });

  describe('Moment B (cascade refill — no winners on this reel)', () => {
    it('returns all-zero offsets so the reel does NOT animate', () => {
      // CRITICAL: in a refill where this reel had no winners, NO row
      // should move - they're all survivors at their existing positions.
      const offsets = computeDropOffsets(5, []);
      expect(offsets.map((o) => o.offsetCells)).toEqual([0, 0, 0, 0, 0]);
      expect(offsets.map((o) => o.originalCell)).toEqual([0, 1, 2, 3, 4]);
    });

    it('also returns all-zero with explicit initial:false', () => {
      const offsets = computeDropOffsets(5, [], { initial: false });
      expect(offsets.map((o) => o.offsetCells)).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe('Moment B (cascade refill — top-only winners)', () => {
    it('drops one new symbol when only the top row was a winner', () => {
      const offsets = computeDropOffsets(5, [0]);
      expect(offsets).toEqual([
        { row: 0, originalCell: -1, offsetCells: 1 },
        { row: 1, originalCell: 1, offsetCells: 0 },
        { row: 2, originalCell: 2, offsetCells: 0 },
        { row: 3, originalCell: 3, offsetCells: 0 },
        { row: 4, originalCell: 4, offsetCells: 0 },
      ]);
    });

    it('drops two new symbols stacked above when top two cells were winners', () => {
      const offsets = computeDropOffsets(5, [0, 1]);
      expect(offsets[0]).toEqual({ row: 0, originalCell: -2, offsetCells: 2 });
      expect(offsets[1]).toEqual({ row: 1, originalCell: -1, offsetCells: 2 });
      expect(offsets[2]).toEqual({ row: 2, originalCell: 2, offsetCells: 0 });
      expect(offsets[3]).toEqual({ row: 3, originalCell: 3, offsetCells: 0 });
      expect(offsets[4]).toEqual({ row: 4, originalCell: 4, offsetCells: 0 });
    });
  });

  describe('Moment B (cascade refill — mid-column winner)', () => {
    it('slides every survivor above the hole down by one cell', () => {
      // Winner at row 2: cells 0 and 1 become "survivors" sliding down to fill
      // cells 1 and 2; row 0 is the new symbol entering from above.
      const offsets = computeDropOffsets(5, [2]);
      expect(offsets).toEqual([
        { row: 0, originalCell: -1, offsetCells: 1 }, // new
        { row: 1, originalCell: 0, offsetCells: 1 },   // was row 0
        { row: 2, originalCell: 1, offsetCells: 1 },   // was row 1
        { row: 3, originalCell: 3, offsetCells: 0 },   // untouched
        { row: 4, originalCell: 4, offsetCells: 0 },   // untouched
      ]);
    });

    it('handles winners scattered across the column', () => {
      // Winners at cells 0 and 2 - survivors are cells 1, 3, 4 (in that order).
      const offsets = computeDropOffsets(5, [0, 2]);
      expect(offsets[0]).toEqual({ row: 0, originalCell: -2, offsetCells: 2 }); // new
      expect(offsets[1]).toEqual({ row: 1, originalCell: -1, offsetCells: 2 }); // new
      expect(offsets[2]).toEqual({ row: 2, originalCell: 1, offsetCells: 1 });  // was row 1
      expect(offsets[3]).toEqual({ row: 3, originalCell: 3, offsetCells: 0 });  // untouched
      expect(offsets[4]).toEqual({ row: 4, originalCell: 4, offsetCells: 0 });  // untouched
    });

    it('handles bottom-only winner — only one survivor slides past it', () => {
      // Winner at row 4 (the bottom). The survivor slide pattern is:
      //   new symbol at row 0
      //   cells 1..4 are survivors of pre-cascade cells 0..3, each sliding down 1
      const offsets = computeDropOffsets(5, [4]);
      expect(offsets).toEqual([
        { row: 0, originalCell: -1, offsetCells: 1 },
        { row: 1, originalCell: 0, offsetCells: 1 },
        { row: 2, originalCell: 1, offsetCells: 1 },
        { row: 3, originalCell: 2, offsetCells: 1 },
        { row: 4, originalCell: 3, offsetCells: 1 },
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles every-row-is-a-winner (full clear, all-new refill)', () => {
      const offsets = computeDropOffsets(3, [0, 1, 2]);
      expect(offsets).toEqual([
        { row: 0, originalCell: -3, offsetCells: 3 },
        { row: 1, originalCell: -2, offsetCells: 3 },
        { row: 2, originalCell: -1, offsetCells: 3 },
      ]);
    });

    it('handles a single-row reel', () => {
      // Initial spin: the single row IS the new symbol.
      expect(computeDropOffsets(1, [], { initial: true })).toEqual([
        { row: 0, originalCell: -1, offsetCells: 1 },
      ]);
      // Refill with the row as winner: the new symbol drops in.
      expect(computeDropOffsets(1, [0])).toEqual([
        { row: 0, originalCell: -1, offsetCells: 1 },
      ]);
      // Refill with NO winners on this reel: nothing moves.
      expect(computeDropOffsets(1, [])).toEqual([
        { row: 0, originalCell: 0, offsetCells: 0 },
      ]);
    });

    it('tolerates unsorted winnerCells input', () => {
      // computeDropOffsets walks 0..visibleCells for survivors, so winner ORDER
      // doesn't matter as long as the set is correct.
      const sorted = computeDropOffsets(5, [0, 2]);
      const unsorted = computeDropOffsets(5, [2, 0]);
      expect(unsorted).toEqual(sorted);
    });
  });
});
