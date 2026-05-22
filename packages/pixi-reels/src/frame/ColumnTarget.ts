/**
 * Per-reel target shape for `ReelSet.setResult` and
 * `ReelSetBuilder.initialFrame`. One object per reel.
 *
 * Use this for every result grid that crosses a worker, network, or
 * serializer boundary. The shape survives `structuredClone`, JSON, and
 * `postMessage` round-trips.
 */
export interface ColumnTarget {
  /** Visible-area target symbols, indexed `0 ... visibleRows-1`. */
  visible: string[];
  /**
   * Buffer-above target symbols. `bufferAbove[0]` is the slot closest to the
   * visible top row; later indices go further above. Up to `bufferSymbols`
   * entries are honored.
   *
   * Big-symbol anchors may sit here. Place a multi-cell symbol id (one whose
   * `SymbolData.size.h > 1`) at any `bufferAbove[i]` and the coordinator
   * paints OCCUPIED stubs across the rest of the block, including any cells
   * that fall in visible. The block must fit on the strip end-to-end
   * (`anchor.row + h <= visibleRows + bufferBelow`); the portion above
   * visible is clipped by the reel mask. This is the "tail-visible"
   * partial-landing pattern.
   */
  bufferAbove?: (string | undefined)[];
  /**
   * Buffer-below target symbols. `bufferBelow[0]` is the slot closest to the
   * visible bottom row; later indices go further below. Up to `bufferSymbols`
   * entries are honored.
   *
   * Big-symbol stubs may sit here. A block anchored at the last visible row
   * with `h > 1` will have its non-anchor cells spill into `bufferBelow`
   * automatically. You can also place an anchor here, but the block then
   * lies entirely off-screen (legal but invisible).
   */
  bufferBelow?: (string | undefined)[];
}

/**
 * Materialize a `ColumnTarget` into the internal `string[]` form the
 * engine pipeline runs on. Buffer-above entries map to negative-index
 * string properties (`arr[-1]`, `arr[-2]`, ...); buffer-below entries
 * map to indices `>= visible.length`.
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
 * Validate that a target grid does not carry more `bufferAbove` / `bufferBelow`
 * entries than the engine can consume. Throws a `RangeError` with a
 * column-pointing message if it does; otherwise a no-op.
 *
 * Background: without this check the failure is silent. `columnTargetToArray`
 * materializes `bufferAbove[k]` as `arr[-1-k]` and `bufferBelow[k]` as
 * `arr[visible.length + k]`, but downstream the pipeline only reads the first
 * `bufferAbove` negative-index slots and the first `bufferBelow` post-visible
 * slots. Extra entries land in the array, are dropped at the next clone, and
 * never reach the reel. Failing here at the entry point is cheaper than a
 * "why did not my target land" debugging session.
 *
 * `callerLabel` shows up in the thrown message so the caller knows which
 * public API surfaced the error.
 */
export function assertBufferCountsInRange(
  grid: ColumnTarget[],
  bufferAbovePerReel: ReadonlyArray<number>,
  bufferBelowPerReel: ReadonlyArray<number>,
  callerLabel: string,
): void {
  for (let c = 0; c < grid.length; c++) {
    const maxAbove = bufferAbovePerReel[c] ?? 0;
    const maxBelow = bufferBelowPerReel[c] ?? 0;
    const item = grid[c];
    const aboveLen = item.bufferAbove?.length ?? 0;
    const belowLen = item.bufferBelow?.length ?? 0;
    if (aboveLen > maxAbove) {
      throw new RangeError(
        `${callerLabel} column ${c}: bufferAbove has ${aboveLen} entries ` +
        `but engine bufferSymbols=${maxAbove}; extra entries would be silently dropped. ` +
        `Increase bufferSymbols(...) on the builder or remove the extra entries.`,
      );
    }
    if (belowLen > maxBelow) {
      throw new RangeError(
        `${callerLabel} column ${c}: bufferBelow has ${belowLen} entries ` +
        `but engine bufferSymbols=${maxBelow}; extra entries would be silently dropped. ` +
        `Increase bufferSymbols(...) on the builder or remove the extra entries.`,
      );
    }
  }
}
