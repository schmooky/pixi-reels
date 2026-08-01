/**
 * Gravity-correct refill geometry for tumble cascades.
 *
 * Two distinct moments use the same algorithm with different inputs:
 *
 *   - **Moment A (initial drop):** `winnerCells = []`. The entire visible
 *     column is treated as "new". every row falls in from above the
 *     viewport. The vertical distance per row is `visibleCells` cells, so
 *     all rows arrive at their grid positions in the same beat.
 *
 *   - **Moment B (cascade refill):** `winnerCells` lists the rows whose
 *     symbols were removed by the most recent win. Survivors slide DOWN
 *     to fill the gaps below them; new symbols enter from above into the
 *     top holes. The new grid follows the server convention that survivors
 *     keep their relative order and pack to the bottom, with `winnerCells.length`
 *     new symbols stacked above them.
 */

/** A cell coordinate on the reel set. `reel` is column, `row` is visible row. */
export interface Cell {
  reel: number;
  row: number;
}

export interface DropOffset {
  /** Visible row in the new grid (top-to-bottom, 0-indexed). */
  row: number;
  /**
   * Where this symbol "came from" expressed as a virtual row index. Negative
   * values indicate "above the viewport" (e.g. -1 is one cell above row 0).
   * Non-negative values indicate "this row in the OLD grid". a survivor.
   */
  originalCell: number;
  /**
   * Number of cells this symbol must traverse downward. Equals
   * `row - originalCell`. Zero means the symbol stays put (no animation).
   */
  offsetCells: number;
}

/**
 * Compute per-row drop offsets for one reel given its winner set.
 *
 * Returns one entry per visible row, top-to-bottom. Rows with
 * `offsetCells === 0` should NOT be animated. they're survivors that
 * didn't move.
 *
 * **Convention** (Moment B): the new grid must place new symbols at the
 * top `winnerCells.length` rows and survivors at the bottom rows in their
 * original top-to-bottom order. This matches how server-side gravity
 * simulations emit cascade results.
 *
 * @param options.initial - When `true` (Moment A. the player's first
 *   spin click), every row is treated as new regardless of `winnerCells`
 *   (which is normally empty for initial spins). When `false` (Moment B
 *  . cascade refill), an empty `winnerCells` means *no movement on this
 *   reel*; survivor reels in a refill correctly return all-zero offsets.
 *   Default `false` so callers can't accidentally trigger a full re-drop
 *   on a reel that had no winners.
 */
export function computeDropOffsets(
  visibleCells: number,
  winnerCells: readonly number[],
  options: { initial?: boolean } = {},
): DropOffset[] {
  const initial = options.initial ?? false;
  // Initial: every visible row is new (Moment A). The empty-winners case
  // in refill (Moment B) gives winCount=0 → all rows resolve to survivors
  // with originalCell === row → offsetCells === 0 → no animation.
  const winCount = initial ? visibleCells : winnerCells.length;
  const winSet = initial ? new Set<number>() : new Set(winnerCells);

  // Survivor rows in the OLD grid, ascending. Indexed by survivor-position
  // (0..nonWinnerRows.length-1) so the bottom rows of the new grid can pull
  // their original row in order.
  const nonWinnerRows: number[] = [];
  for (let r = 0; r < visibleCells; r++) {
    if (!winSet.has(r)) nonWinnerRows.push(r);
  }

  const offsets: DropOffset[] = [];
  for (let row = 0; row < visibleCells; row++) {
    let originalCell: number;
    if (row < winCount) {
      // New symbol. virtual origin sits above the viewport, stacked so
      // every "new" symbol falls the same distance (`winCount` cells).
      originalCell = row - winCount;
    } else {
      // Survivor. read its OLD row from the precomputed survivor list.
      originalCell = nonWinnerRows[row - winCount];
    }
    offsets.push({ row, originalCell, offsetCells: row - originalCell });
  }
  return offsets;
}
