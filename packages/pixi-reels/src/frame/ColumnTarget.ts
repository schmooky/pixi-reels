/**
 * Per-reel target shape for `ReelSet.setResult`. The explicit alternative to
 * the legacy `string[]` form where buffer-above slots are stored as
 * negative-index string properties (`arr[-1]`, `arr[-2]`).
 *
 * Both forms are accepted by `setResult`. The explicit form is easier to
 * type-check, serialize across worker/network boundaries, and read in code
 * reviews — internally the engine normalizes one to the other.
 */
export interface ColumnTarget {
  /** Visible-area target symbols, indexed `0 … visibleRows-1`. */
  visible: string[];
  /**
   * Buffer-above target symbols. `bufferAbove[0]` is the slot closest to the
   * visible top row; `bufferAbove[bufferAboveCount-1]` is the furthest above.
   * Equivalent to legacy `frame[col][-1] … frame[col][-bufferAboveCount]`.
   */
  bufferAbove?: (string | undefined)[];
  /**
   * Buffer-below target symbols. `bufferBelow[0]` is the slot closest to the
   * visible bottom row; later indices go further below.
   * Equivalent to legacy `frame[col][visibleRows] … frame[col][visibleRows + n - 1]`.
   */
  bufferBelow?: (string | undefined)[];
}

/**
 * True when `grid` is the explicit `ColumnTarget[]` form. False for the
 * legacy `string[][]` form. Discriminated by whether the first column is an
 * array (legacy) or a plain object (explicit).
 */
export function isColumnTargetGrid(
  grid: string[][] | ColumnTarget[],
): grid is ColumnTarget[] {
  return grid.length > 0 && !Array.isArray(grid[0]);
}

/**
 * Clone a per-reel target grid while preserving negative-index slots used by
 * buffer-above targeting.
 *
 * **CONTRIBUTOR NOTE — do not replace with plain spread.**
 *
 * The legacy public API supports `frame[col][-1] = 'COIN'` for targeting
 * the cell just above the visible window. JavaScript stores that as a
 * string property `"-1"` on the array object. Standard spread (`[...col]`),
 * `structuredClone`, `JSON.stringify`, `Array.from`, and `postMessage`
 * **all silently drop** those non-numeric properties. Any code path that
 * needs to clone a result grid in the engine **must** route through this
 * helper, or buffer-above targeting will silently break end-to-end and the
 * integration tests in `tests/integration/setResult-bufferAbove.test.ts`
 * will fail. See `tests/unit/ColumnTarget.test.ts` for the canary.
 *
 * Two existing call sites depend on this:
 *   - `ReelSet._applyPinsToGrid`
 *   - `SpinController._coordinateBigSymbols`
 *
 * If you add a third clone site, use this helper there too.
 */
export function cloneTargetGrid(grid: string[][], bufferAbove: number): string[][] {
  return grid.map((col) => cloneColumn(col, bufferAbove));
}

/** Single-column form of {@link cloneTargetGrid}. Same contributor rules. */
export function cloneColumn(col: string[], bufferAbove: number): string[] {
  const out = [...col];
  for (let i = 1; i <= bufferAbove; i++) {
    const v = (col as Record<number, string | undefined>)[-i];
    if (v !== undefined) (out as Record<number, string>)[-i] = v;
  }
  return out;
}

/**
 * Convert a `ColumnTarget` to the legacy `string[]` form, materializing
 * `bufferAbove` entries as negative-index slots and `bufferBelow` entries as
 * indices `>= visible.length`. This is what the rest of the pipeline (the
 * `FrameBuilder` target-placement middleware, big-symbol coordinator, pins)
 * already understands.
 */
export function columnTargetToArray(target: ColumnTarget): string[] {
  const arr: string[] = [...target.visible];
  if (target.bufferBelow) {
    for (let i = 0; i < target.bufferBelow.length; i++) {
      const v = target.bufferBelow[i];
      if (v !== undefined) arr[target.visible.length + i] = v;
    }
  }
  if (target.bufferAbove) {
    for (let i = 0; i < target.bufferAbove.length; i++) {
      const v = target.bufferAbove[i];
      if (v !== undefined) (arr as Record<number, string>)[-1 - i] = v;
    }
  }
  return arr;
}

/**
 * Normalize either input form into the legacy `string[][]` shape the
 * pipeline runs on. Cheap when the input is already `string[][]` — returns
 * it unchanged. Otherwise materializes one `string[]` per column.
 *
 * Throws with a readable message if the columns are a mix of the two
 * shapes (e.g. `[ ['a','b'], { visible: ['c','d'] } ]`). TypeScript blocks
 * this at compile time, but a JS caller bypassing types would otherwise
 * crash later with a confusing `[...col]`-not-iterable error inside the
 * pipeline; we fail loudly at the entry point instead.
 */
export function toLegacyTargetGrid(
  grid: string[][] | ColumnTarget[],
): string[][] {
  if (grid.length === 0) return grid as string[][];
  const firstIsArray = Array.isArray(grid[0]);
  for (let i = 1; i < grid.length; i++) {
    if (Array.isArray(grid[i]) !== firstIsArray) {
      const a = firstIsArray ? 'string[]' : 'ColumnTarget';
      const b = Array.isArray(grid[i]) ? 'string[]' : 'ColumnTarget';
      throw new Error(
        `setResult/initialFrame: mixed input shapes — column 0 is ${a} ` +
        `but column ${i} is ${b}. Use one shape consistently for all reels.`,
      );
    }
  }
  if (firstIsArray) return grid as string[][];
  return (grid as ColumnTarget[]).map(columnTargetToArray);
}
