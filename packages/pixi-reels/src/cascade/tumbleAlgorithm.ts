/**
 * Gravity-correct refill geometry for tumble cascades.
 *
 * Two distinct moments use the same algorithm with different inputs:
 *
 *   - **Moment A (initial drop):** `winnerCells = []`. The entire visible
 *     column is treated as "new". every cell falls in from above the
 *     viewport. The vertical distance per cell is `visibleCells` cells, so
 *     all cells arrive at their grid positions in the same beat.
 *
 *   - **Moment B (cascade refill):** `winnerCells` lists the cells whose
 *     symbols were removed by the most recent win. Survivors slide toward
 *     the gravity-exit edge to fill the gaps; new symbols enter from the
 *     gravity-entry edge into the holes left behind. The new grid follows
 *     the server convention that survivors keep their relative order and
 *     pack against the exit edge, with `winnerCells.length` new symbols
 *     stacked behind them.
 *
 * Which edge is which comes from `gravity` (ADR 016 section 3.6), NOT from
 * the screen axis: `'forward'` settles toward the larger cell index (down on
 * a vertical set, right on a horizontal one), `'reverse'` toward the smaller.
 * The algorithm is pure index arithmetic, so orientation never reaches it -
 * only the reel's travel direction does.
 */
import type { Direction } from '../core/ReelAxis.js';

/** A cell coordinate on the reel set. `reel` is column, `cell` is visible cell. */
export interface Cell {
  reel: number;
  cell: number;
}

export interface DropOffset {
  /** Visible cell in the new grid (start-to-end, 0-indexed). */
  cell: number;
  /**
   * Where this symbol "came from" expressed as a virtual cell index.
   * Off-grid values name the cell the symbol enters from: under
   * `gravity: 'forward'` new symbols come from negative indices (before
   * cell 0); under `'reverse'` they come from `visibleCells` and up. An
   * index inside `[0, visibleCells)` is a survivor's OLD cell.
   *
   * Read {@link DropOffset.isNew} rather than testing the sign - the sign
   * only discriminates under forward gravity.
   */
  originalCell: number;
  /**
   * Signed cell distance this symbol travels: `cell - originalCell`.
   * Positive moves toward the end edge (forward gravity), negative toward
   * the start edge (reverse gravity). Zero means the symbol stays put and
   * must NOT be animated.
   */
  offsetCells: number;
  /**
   * True when this is a fresh symbol entering from off-grid, false for a
   * survivor that was already on the reel. The discriminator every caller
   * should branch on; `originalCell < 0` is only equivalent under forward
   * gravity.
   */
  isNew: boolean;
}

/**
 * Compute per-cell drop offsets for one reel given its winner set.
 *
 * Returns one entry per visible cell, top-to-bottom. Cells with
 * `offsetCells === 0` should NOT be animated. they're survivors that
 * didn't move.
 *
 * **Convention** (Moment B): the new grid must place new symbols at the
 * top `winnerCells.length` cells and survivors at the bottom cells in their
 * original top-to-bottom order. This matches how server-side gravity
 * simulations emit cascade results.
 *
 * @param options.initial - When `true` (Moment A. the player's first
 *   spin click), every cell is treated as new regardless of `winnerCells`
 *   (which is normally empty for initial spins). When `false` (Moment B
 *  . cascade refill), an empty `winnerCells` means *no movement on this
 *   reel*; survivor reels in a refill correctly return all-zero offsets.
 *   Default `false` so callers can't accidentally trigger a full re-drop
 *   on a reel that had no winners.
 */
export function computeDropOffsets(
  visibleCells: number,
  winnerCells: readonly number[],
  options: { initial?: boolean; gravity?: Direction } = {},
): DropOffset[] {
  const initial = options.initial ?? false;
  const gravity = options.gravity ?? 'forward';
  // Initial: every visible cell is new (Moment A). The empty-winners case
  // in refill (Moment B) gives winCount=0 → all cells resolve to survivors
  // with originalCell === cell → offsetCells === 0 → no animation.
  const winCount = initial ? visibleCells : winnerCells.length;
  const winSet = initial ? new Set<number>() : new Set(winnerCells);

  // Survivor cells in the OLD grid, ascending. Indexed by survivor-position
  // so the cells nearest the gravity-exit edge can pull their original cell
  // in order.
  const nonWinnerCells: number[] = [];
  for (let r = 0; r < visibleCells; r++) {
    if (!winSet.has(r)) nonWinnerCells.push(r);
  }

  // Under 'forward' gravity symbols settle toward the LARGER cell index, so
  // survivors pack into the tail and new symbols occupy the head, entering
  // from negative indices. 'reverse' is the exact mirror: survivors pack
  // into the head and new symbols occupy the tail, entering from
  // `visibleCells` and beyond. Everything else - the absolute main
  // coordinate of a virtual cell, the sign of `offsetCells` - falls out of
  // the index arithmetic, which is why the phases need no second branch.
  const survivorCount = visibleCells - winCount;
  const offsets: DropOffset[] = [];
  for (let cell = 0; cell < visibleCells; cell++) {
    const isNew = gravity === 'forward' ? cell < winCount : cell >= survivorCount;
    let originalCell: number;
    if (isNew) {
      // Stack the arrivals just off the gravity-entry edge so every new
      // symbol travels the same `winCount` cells.
      originalCell = gravity === 'forward' ? cell - winCount : cell + winCount;
    } else {
      // Survivor. read its OLD cell from the precomputed survivor list.
      originalCell = gravity === 'forward'
        ? nonWinnerCells[cell - winCount]
        : nonWinnerCells[cell];
    }
    offsets.push({ cell, originalCell, offsetCells: cell - originalCell, isNew });
  }
  return offsets;
}
