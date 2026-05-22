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
   */
  bufferAbove?: (string | undefined)[];
  /**
   * Buffer-below target symbols. `bufferBelow[0]` is the slot closest to the
   * visible bottom row; later indices go further below. Up to `bufferSymbols`
   * entries are honored.
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
