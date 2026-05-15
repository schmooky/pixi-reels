/**
 * Gravity-correct refill geometry for tumble cascades.
 *
 * Two distinct moments use the same algorithm with different inputs:
 *
 *   - **Moment A (initial drop):** `winnerRows = []`. The entire visible
 *     column is treated as "new" — every row falls in from above the
 *     viewport. The vertical distance per row is `visibleRows` cells, so
 *     all rows arrive at their grid positions in the same beat.
 *
 *   - **Moment B (cascade refill):** `winnerRows` lists the rows whose
 *     symbols were removed by the most recent win. Survivors slide DOWN
 *     to fill the gaps below them; new symbols enter from above into the
 *     top holes. The new grid follows the server convention that survivors
 *     keep their relative order and pack to the bottom, with `winnerRows.length`
 *     new symbols stacked above them.
 */

/** A cell coordinate on the reel set — `reel` is column, `row` is visible row. */
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
   * Non-negative values indicate "this row in the OLD grid" — a survivor.
   */
  originalRow: number;
  /**
   * Number of cells this symbol must traverse downward. Equals
   * `row - originalRow`. Zero means the symbol stays put (no animation).
   */
  offsetRows: number;
}

/**
 * Compute per-row drop offsets for one reel given its winner set.
 *
 * Returns one entry per visible row, top-to-bottom. Rows with
 * `offsetRows === 0` should NOT be animated — they're survivors that
 * didn't move.
 *
 * **Convention** (Moment B): the new grid must place new symbols at the
 * top `winnerRows.length` rows and survivors at the bottom rows in their
 * original top-to-bottom order. This matches how server-side gravity
 * simulations emit cascade results.
 */
export function computeDropOffsets(
  visibleRows: number,
  winnerRows: readonly number[],
): DropOffset[] {
  // Empty winners → Moment A: treat every row as new. winCount becomes the
  // full column height so each row's "virtual origin" sits above the viewport.
  const winCount = winnerRows.length === 0 ? visibleRows : winnerRows.length;
  const winSet = new Set(winnerRows);

  // Survivor rows in the OLD grid, ascending. Indexed by survivor-position
  // (0..nonWinnerRows.length-1) so the bottom rows of the new grid can pull
  // their original row in order.
  const nonWinnerRows: number[] = [];
  for (let r = 0; r < visibleRows; r++) {
    if (!winSet.has(r)) nonWinnerRows.push(r);
  }

  const offsets: DropOffset[] = [];
  for (let row = 0; row < visibleRows; row++) {
    let originalRow: number;
    if (row < winCount) {
      // New symbol — virtual origin sits above the viewport, stacked so
      // every "new" symbol falls the same distance (`winCount` cells).
      originalRow = row - winCount;
    } else {
      // Survivor — read its OLD row from the precomputed survivor list.
      originalRow = nonWinnerRows[row - winCount];
    }
    offsets.push({ row, originalRow, offsetRows: row - originalRow });
  }
  return offsets;
}
