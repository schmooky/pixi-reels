import { describe, expect, it } from 'vitest';
import { computeDropOffsets } from '../../src/cascade/tumbleAlgorithm.js';

describe('computeDropOffsets', () => {
  describe('Moment A (initial drop)', () => {
    it('treats every visible cell as a new symbol', () => {
      const offsets = computeDropOffsets(5, [], { initial: true });
      expect(offsets).toEqual([
        { cell: 0, originalCell: -5, offsetCells: 5, isNew: true },
        { cell: 1, originalCell: -4, offsetCells: 5, isNew: true },
        { cell: 2, originalCell: -3, offsetCells: 5, isNew: true },
        { cell: 3, originalCell: -2, offsetCells: 5, isNew: true },
        { cell: 4, originalCell: -1, offsetCells: 5, isNew: true },
      ]);
    });

    it('gives every symbol the same fall distance (visibleCells cells)', () => {
      const offsets = computeDropOffsets(7, [], { initial: true });
      const distances = offsets.map((o) => o.offsetCells);
      expect(distances).toEqual([7, 7, 7, 7, 7, 7, 7]);
    });

    it('stacks origins above the viewport so they form a vertical column', () => {
      const offsets = computeDropOffsets(4, [], { initial: true });
      // Each new symbol's virtual origin sits exactly (winCount - cell) cells
      // above its target - so origins span -4..-1, the new column.
      const origins = offsets.map((o) => o.originalCell);
      expect(origins).toEqual([-4, -3, -2, -1]);
    });

    it('ignores winnerCells entirely when initial=true', () => {
      // Even with stale winnerCells passed by mistake, initial overrides:
      // every cell is treated as new.
      const offsets = computeDropOffsets(3, [0, 2], { initial: true });
      expect(offsets.map((o) => o.offsetCells)).toEqual([3, 3, 3]);
    });
  });

  describe('Moment B (cascade refill — no winners on this reel)', () => {
    it('returns all-zero offsets so the reel does NOT animate', () => {
      // CRITICAL: in a refill where this reel had no winners, NO cell
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
    it('drops one new symbol when only the top cell was a winner', () => {
      const offsets = computeDropOffsets(5, [0]);
      expect(offsets).toEqual([
        { cell: 0, originalCell: -1, offsetCells: 1, isNew: true },
        { cell: 1, originalCell: 1, offsetCells: 0, isNew: false },
        { cell: 2, originalCell: 2, offsetCells: 0, isNew: false },
        { cell: 3, originalCell: 3, offsetCells: 0, isNew: false },
        { cell: 4, originalCell: 4, offsetCells: 0, isNew: false },
      ]);
    });

    it('drops two new symbols stacked above when top two cells were winners', () => {
      const offsets = computeDropOffsets(5, [0, 1]);
      expect(offsets[0]).toEqual({ cell: 0, originalCell: -2, offsetCells: 2, isNew: true });
      expect(offsets[1]).toEqual({ cell: 1, originalCell: -1, offsetCells: 2, isNew: true });
      expect(offsets[2]).toEqual({ cell: 2, originalCell: 2, offsetCells: 0, isNew: false });
      expect(offsets[3]).toEqual({ cell: 3, originalCell: 3, offsetCells: 0, isNew: false });
      expect(offsets[4]).toEqual({ cell: 4, originalCell: 4, offsetCells: 0, isNew: false });
    });
  });

  describe('Moment B (cascade refill — mid-column winner)', () => {
    it('slides every survivor above the hole down by one cell', () => {
      // Winner at cell 2: cells 0 and 1 become "survivors" sliding down to fill
      // cells 1 and 2; cell 0 is the new symbol entering from above.
      const offsets = computeDropOffsets(5, [2]);
      expect(offsets).toEqual([
        { cell: 0, originalCell: -1, offsetCells: 1, isNew: true }, // new
        { cell: 1, originalCell: 0, offsetCells: 1, isNew: false },   // was cell 0
        { cell: 2, originalCell: 1, offsetCells: 1, isNew: false },   // was cell 1
        { cell: 3, originalCell: 3, offsetCells: 0, isNew: false },   // untouched
        { cell: 4, originalCell: 4, offsetCells: 0, isNew: false },   // untouched
      ]);
    });

    it('handles winners scattered across the column', () => {
      // Winners at cells 0 and 2 - survivors are cells 1, 3, 4 (in that order).
      const offsets = computeDropOffsets(5, [0, 2]);
      expect(offsets[0]).toEqual({ cell: 0, originalCell: -2, offsetCells: 2, isNew: true }); // new
      expect(offsets[1]).toEqual({ cell: 1, originalCell: -1, offsetCells: 2, isNew: true }); // new
      expect(offsets[2]).toEqual({ cell: 2, originalCell: 1, offsetCells: 1, isNew: false });  // was cell 1
      expect(offsets[3]).toEqual({ cell: 3, originalCell: 3, offsetCells: 0, isNew: false });  // untouched
      expect(offsets[4]).toEqual({ cell: 4, originalCell: 4, offsetCells: 0, isNew: false });  // untouched
    });

    it('handles bottom-only winner — only one survivor slides past it', () => {
      // Winner at cell 4 (the bottom). The survivor slide pattern is:
      //   new symbol at cell 0
      //   cells 1..4 are survivors of pre-cascade cells 0..3, each sliding down 1
      const offsets = computeDropOffsets(5, [4]);
      expect(offsets).toEqual([
        { cell: 0, originalCell: -1, offsetCells: 1, isNew: true },
        { cell: 1, originalCell: 0, offsetCells: 1, isNew: false },
        { cell: 2, originalCell: 1, offsetCells: 1, isNew: false },
        { cell: 3, originalCell: 2, offsetCells: 1, isNew: false },
        { cell: 4, originalCell: 3, offsetCells: 1, isNew: false },
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles every-cell-is-a-winner (full clear, all-new refill)', () => {
      const offsets = computeDropOffsets(3, [0, 1, 2]);
      expect(offsets).toEqual([
        { cell: 0, originalCell: -3, offsetCells: 3, isNew: true },
        { cell: 1, originalCell: -2, offsetCells: 3, isNew: true },
        { cell: 2, originalCell: -1, offsetCells: 3, isNew: true },
      ]);
    });

    it('handles a single-cell reel', () => {
      // Initial spin: the single cell IS the new symbol.
      expect(computeDropOffsets(1, [], { initial: true })).toEqual([
        { cell: 0, originalCell: -1, offsetCells: 1, isNew: true },
      ]);
      // Refill with the cell as winner: the new symbol drops in.
      expect(computeDropOffsets(1, [0])).toEqual([
        { cell: 0, originalCell: -1, offsetCells: 1, isNew: true },
      ]);
      // Refill with NO winners on this reel: nothing moves.
      expect(computeDropOffsets(1, [])).toEqual([
        { cell: 0, originalCell: 0, offsetCells: 0, isNew: false },
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

  describe("gravity: 'reverse'", () => {
    it('packs survivors against the START edge and feeds from the END edge', () => {
      // Winner at cell 0. Under reverse gravity the survivors (old cells 1, 2)
      // slide TOWARD cell 0, and the new symbol enters past the end edge.
      const offsets = computeDropOffsets(3, [0], { gravity: 'reverse' });
      expect(offsets).toEqual([
        { cell: 0, originalCell: 1, offsetCells: -1, isNew: false },
        { cell: 1, originalCell: 2, offsetCells: -1, isNew: false },
        { cell: 2, originalCell: 3, offsetCells: -1, isNew: true },
      ]);
    });

    it('enters new symbols from beyond the end edge on an initial drop', () => {
      const offsets = computeDropOffsets(3, [], { initial: true, gravity: 'reverse' });
      expect(offsets.map((o) => o.originalCell)).toEqual([3, 4, 5]);
      expect(offsets.map((o) => o.offsetCells)).toEqual([-3, -3, -3]);
      expect(offsets.every((o) => o.isNew)).toBe(true);
    });

    it('stacks multiple arrivals so they all travel the same distance', () => {
      const offsets = computeDropOffsets(3, [0, 1], { gravity: 'reverse' });
      expect(offsets).toEqual([
        { cell: 0, originalCell: 2, offsetCells: -2, isNew: false },
        { cell: 1, originalCell: 3, offsetCells: -2, isNew: true },
        { cell: 2, originalCell: 4, offsetCells: -2, isNew: true },
      ]);
    });

    it('still moves nothing when this reel had no winners', () => {
      const offsets = computeDropOffsets(5, [], { gravity: 'reverse' });
      expect(offsets.map((o) => o.offsetCells)).toEqual([0, 0, 0, 0, 0]);
      expect(offsets.some((o) => o.isNew)).toBe(false);
    });

    it('is the exact mirror of forward gravity', () => {
      // The law that makes this more than a second hand-written table:
      // reversing gravity == reflecting the cell axis. Mirror the winners,
      // run forward, reflect the result, and it must match reverse exactly.
      const n = 6;
      const mirror = (c: number) => n - 1 - c;
      for (const winners of [[0], [3], [0, 2], [1, 4, 5], [], [0, 1, 2, 3, 4, 5]]) {
        const rev = computeDropOffsets(n, winners, { gravity: 'reverse' });
        const fwd = computeDropOffsets(n, winners.map(mirror), { gravity: 'forward' });
        const reflected = fwd
          .map((o) => ({
            cell: mirror(o.cell),
            originalCell: mirror(o.originalCell),
            // `-0` and `0` are distinct to toEqual, and negating a zero
            // offset yields -0. Normalise so the law compares magnitudes.
            offsetCells: o.offsetCells === 0 ? 0 : -o.offsetCells,
            isNew: o.isNew,
          }))
          .sort((a, b) => a.cell - b.cell);
        expect(reflected, `winners ${JSON.stringify(winners)}`).toEqual(rev);
      }
    });

    it('defaults to forward when gravity is omitted', () => {
      expect(computeDropOffsets(4, [1])).toEqual(
        computeDropOffsets(4, [1], { gravity: 'forward' }),
      );
    });
  });
});
