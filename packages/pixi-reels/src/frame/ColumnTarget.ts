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
   *
   * **Big-symbol anchors may sit here.** Place a multi-cell symbol id (one
   * whose `SymbolData.size.h > 1`) at any `bufferAbove[i]` and the
   * coordinator paints OCCUPIED stubs across the rest of the block —
   * including any cells that fall in visible. The block must fit on the
   * strip end-to-end (`anchor.row + h <= visibleRows + bufferBelow`); the
   * portion above visible is clipped by the reel mask. This is the
   * "tail-visible" partial-landing pattern.
   */
  bufferAbove?: (string | undefined)[];
  /**
   * Buffer-below target symbols. `bufferBelow[0]` is the slot closest to the
   * visible bottom row; later indices go further below.
   * Equivalent to legacy `frame[col][visibleRows] … frame[col][visibleRows + n - 1]`.
   *
   * **Big-symbol stubs may sit here.** A block anchored at the last visible
   * row with `h > 1` will have its non-anchor cells spill into `bufferBelow`
   * automatically — you don't need to place stubs by hand. You can also
   * place an anchor here, but the block then lies entirely off-screen
   * (legal but invisible — the engine accepts the placement).
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
 * Validate that a target grid does not carry more buffer-above / buffer-below
 * entries than the engine can consume. Throws a `RangeError` with a
 * column-pointing message if it does; otherwise a no-op.
 *
 * Background — without this check the failure is silent. `columnTargetToArray`
 * materializes `bufferAbove[k]` as `arr[-1-k]` and `bufferBelow[k]` as
 * `arr[visible.length + k]`, but downstream the pipeline only reads the first
 * `bufferAbove` negative-index slots (see `cloneColumn` — its loop runs
 * `1..bufferAbove` only) and the first `bufferBelow` post-visible slots.
 * Extra entries land in the array, are dropped at the next clone, and never
 * reach the reel. Failing here at the entry point is far cheaper than a
 * "why didn't my target land" debugging session.
 *
 * Validates both input forms:
 *   - Explicit `ColumnTarget`: checks `bufferAbove.length` and
 *     `bufferBelow.length` directly against the engine's configured counts.
 *     This is the form most likely to be misused — its lengths survive
 *     `structuredClone`, so an off-by-one overflow can ride along
 *     unnoticed across worker / network boundaries.
 *   - Legacy `string[]`: scans own-property names for negative-index keys
 *     beyond `-bufferAbove`. We do NOT validate the array length against
 *     `visibleRows + bufferBelow` for this form: in MultiWays the per-reel
 *     `visibleRows` changes after `setShape()` but before `setResult()`,
 *     so any visibleRows-based check fires false positives on legitimate
 *     post-reshape calls. The negative-index check is safe because
 *     `bufferAbove` is stable across reshape (see Reel.reshape — only
 *     `_visibleRows` mutates; `_bufferAbove` is reassigned to the same
 *     value). Callers using the legacy form for `bufferBelow` overflow
 *     should switch to the explicit form, which has no such limitation.
 *
 * Mixed-shape grids are NOT validated here — `toLegacyTargetGrid` already
 * throws on those with a more specific message, and the validator inspects
 * each column on its own merits so mixing won't crash this pass.
 *
 * `callerLabel` shows up in the thrown message so the caller knows which
 * public API surfaced the error.
 */
export function assertBufferCountsInRange(
  grid: string[][] | ColumnTarget[],
  bufferAbovePerReel: ReadonlyArray<number>,
  bufferBelowPerReel: ReadonlyArray<number>,
  callerLabel: string,
): void {
  for (let c = 0; c < grid.length; c++) {
    const maxAbove = bufferAbovePerReel[c] ?? 0;
    const maxBelow = bufferBelowPerReel[c] ?? 0;
    const item = grid[c];

    if (Array.isArray(item)) {
      let mostNegative = 0;
      for (const key of Object.getOwnPropertyNames(item)) {
        if (key[0] !== '-') continue;
        const n = Number(key);
        if (Number.isInteger(n) && n < 0 && n < mostNegative) mostNegative = n;
      }
      if (-mostNegative > maxAbove) {
        throw new RangeError(
          `${callerLabel} column ${c}: frame[${c}][${mostNegative}] is set ` +
          `but engine bufferSymbols=${maxAbove} — only frame[${c}][-1..-${maxAbove}] is consumed; ` +
          `extra entries would be silently dropped. ` +
          `Increase bufferSymbols(...) on the builder or remove the extra entries.`,
        );
      }
    } else {
      const aboveLen = item.bufferAbove?.length ?? 0;
      const belowLen = item.bufferBelow?.length ?? 0;
      if (aboveLen > maxAbove) {
        throw new RangeError(
          `${callerLabel} column ${c}: bufferAbove has ${aboveLen} entries ` +
          `but engine bufferSymbols=${maxAbove} — extra entries would be silently dropped. ` +
          `Increase bufferSymbols(...) on the builder or remove the extra entries.`,
        );
      }
      if (belowLen > maxBelow) {
        throw new RangeError(
          `${callerLabel} column ${c}: bufferBelow has ${belowLen} entries ` +
          `but engine bufferSymbols=${maxBelow} — extra entries would be silently dropped. ` +
          `Increase bufferSymbols(...) on the builder or remove the extra entries.`,
        );
      }
    }
  }
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
