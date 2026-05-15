import { describe, expect, it } from 'vitest';
import { computeDropOffsets } from '../../src/cascade/tumbleAlgorithm.js';

describe('computeDropOffsets', () => {
  describe('Moment A (no winners — initial drop)', () => {
    it('treats every visible row as a new symbol', () => {
      const offsets = computeDropOffsets(5, []);
      expect(offsets).toEqual([
        { row: 0, originalRow: -5, offsetRows: 5 },
        { row: 1, originalRow: -4, offsetRows: 5 },
        { row: 2, originalRow: -3, offsetRows: 5 },
        { row: 3, originalRow: -2, offsetRows: 5 },
        { row: 4, originalRow: -1, offsetRows: 5 },
      ]);
    });

    it('gives every symbol the same fall distance (visibleRows cells)', () => {
      const offsets = computeDropOffsets(7, []);
      const distances = offsets.map((o) => o.offsetRows);
      expect(distances).toEqual([7, 7, 7, 7, 7, 7, 7]);
    });

    it('stacks origins above the viewport so they form a vertical column', () => {
      const offsets = computeDropOffsets(4, []);
      // Each new symbol's virtual origin sits exactly (winCount - row) cells
      // above its target — so origins span -4..-1, the new column.
      const origins = offsets.map((o) => o.originalRow);
      expect(origins).toEqual([-4, -3, -2, -1]);
    });
  });

  describe('Moment B (cascade refill — top-only winners)', () => {
    it('drops one new symbol when only the top row was a winner', () => {
      const offsets = computeDropOffsets(5, [0]);
      expect(offsets).toEqual([
        { row: 0, originalRow: -1, offsetRows: 1 },
        { row: 1, originalRow: 1, offsetRows: 0 },
        { row: 2, originalRow: 2, offsetRows: 0 },
        { row: 3, originalRow: 3, offsetRows: 0 },
        { row: 4, originalRow: 4, offsetRows: 0 },
      ]);
    });

    it('drops two new symbols stacked above when top two rows were winners', () => {
      const offsets = computeDropOffsets(5, [0, 1]);
      expect(offsets[0]).toEqual({ row: 0, originalRow: -2, offsetRows: 2 });
      expect(offsets[1]).toEqual({ row: 1, originalRow: -1, offsetRows: 2 });
      expect(offsets[2]).toEqual({ row: 2, originalRow: 2, offsetRows: 0 });
      expect(offsets[3]).toEqual({ row: 3, originalRow: 3, offsetRows: 0 });
      expect(offsets[4]).toEqual({ row: 4, originalRow: 4, offsetRows: 0 });
    });
  });

  describe('Moment B (cascade refill — mid-column winner)', () => {
    it('slides every survivor above the hole down by one cell', () => {
      // Winner at row 2: rows 0 and 1 become "survivors" sliding down to fill
      // rows 1 and 2; row 0 is the new symbol entering from above.
      const offsets = computeDropOffsets(5, [2]);
      expect(offsets).toEqual([
        { row: 0, originalRow: -1, offsetRows: 1 }, // new
        { row: 1, originalRow: 0, offsetRows: 1 },   // was row 0
        { row: 2, originalRow: 1, offsetRows: 1 },   // was row 1
        { row: 3, originalRow: 3, offsetRows: 0 },   // untouched
        { row: 4, originalRow: 4, offsetRows: 0 },   // untouched
      ]);
    });

    it('handles winners scattered across the column', () => {
      // Winners at rows 0 and 2 — survivors are rows 1, 3, 4 (in that order).
      const offsets = computeDropOffsets(5, [0, 2]);
      expect(offsets[0]).toEqual({ row: 0, originalRow: -2, offsetRows: 2 }); // new
      expect(offsets[1]).toEqual({ row: 1, originalRow: -1, offsetRows: 2 }); // new
      expect(offsets[2]).toEqual({ row: 2, originalRow: 1, offsetRows: 1 });  // was row 1
      expect(offsets[3]).toEqual({ row: 3, originalRow: 3, offsetRows: 0 });  // untouched
      expect(offsets[4]).toEqual({ row: 4, originalRow: 4, offsetRows: 0 });  // untouched
    });

    it('handles bottom-only winner — only one survivor slides past it', () => {
      // Winner at row 4 (the bottom). The survivor slide pattern is:
      //   new symbol at row 0
      //   rows 1..4 are survivors of pre-cascade rows 0..3, each sliding down 1
      const offsets = computeDropOffsets(5, [4]);
      expect(offsets).toEqual([
        { row: 0, originalRow: -1, offsetRows: 1 },
        { row: 1, originalRow: 0, offsetRows: 1 },
        { row: 2, originalRow: 1, offsetRows: 1 },
        { row: 3, originalRow: 2, offsetRows: 1 },
        { row: 4, originalRow: 3, offsetRows: 1 },
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles every-row-is-a-winner (full clear, all-new refill)', () => {
      const offsets = computeDropOffsets(3, [0, 1, 2]);
      expect(offsets).toEqual([
        { row: 0, originalRow: -3, offsetRows: 3 },
        { row: 1, originalRow: -2, offsetRows: 3 },
        { row: 2, originalRow: -1, offsetRows: 3 },
      ]);
    });

    it('handles a single-row reel', () => {
      expect(computeDropOffsets(1, [])).toEqual([
        { row: 0, originalRow: -1, offsetRows: 1 },
      ]);
      expect(computeDropOffsets(1, [0])).toEqual([
        { row: 0, originalRow: -1, offsetRows: 1 },
      ]);
    });

    it('tolerates unsorted winnerRows input', () => {
      // computeDropOffsets walks 0..visibleRows for survivors, so winner ORDER
      // doesn't matter as long as the set is correct.
      const sorted = computeDropOffsets(5, [0, 2]);
      const unsorted = computeDropOffsets(5, [2, 0]);
      expect(unsorted).toEqual(sorted);
    });
  });
});
