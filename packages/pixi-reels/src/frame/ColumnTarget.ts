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
 * Read one slot of a `ColumnTarget` by **row**, the engine's
 * visible-relative coordinate: `0` is the first visible cell, negative rows
 * address `bufferAbove` (`-1` is the slot closest to the visible top row),
 * and rows `>= visible.length` address `bufferBelow`.
 *
 * Returns `undefined` for any row the target does not specify.
 */
export function getTargetSlot(target: ColumnTarget, row: number): string | undefined {
  if (row < 0) return target.bufferAbove?.[-1 - row];
  if (row < target.visible.length) return target.visible[row];
  return target.bufferBelow?.[row - target.visible.length];
}

/**
 * Write one slot of a `ColumnTarget` by row, using the same coordinate as
 * {@link getTargetSlot}. Creates and extends `bufferAbove` / `bufferBelow`
 * as needed, so a caller can address any row on the strip without knowing
 * whether the target declared a buffer.
 *
 * Mutates `target`. Clone first if the caller must not touch the original.
 */
export function setTargetSlot(target: ColumnTarget, row: number, id: string): void {
  if (row < 0) {
    (target.bufferAbove ??= [])[-1 - row] = id;
  } else if (row < target.visible.length) {
    target.visible[row] = id;
  } else {
    (target.bufferBelow ??= [])[row - target.visible.length] = id;
  }
}

/**
 * Materialize a `ColumnTarget` into **strip form**: one entry per strip
 * slot, top to bottom. Index `0` is the furthest buffer-above cell, index
 * `bufferAbove` is the first visible cell, and the tail holds buffer-below
 * cells. This is the same indexing `FrameBuilder.build` returns and
 * `Reel.placeStrip` consumes.
 *
 * Entries the target does not specify come back `undefined`; the caller
 * decides what to do with them (the engine random-fills).
 *
 * `bufferAbove` is the reel's buffer-above *capacity*. Target entries past
 * it cannot reach the strip and are dropped here. `assertBufferCountsInRange`
 * rejects them at the public entry points so that drop is never silent.
 */
export function columnTargetToStrip(
  target: ColumnTarget,
  bufferAbove: number,
): (string | undefined)[] {
  const belowLength = target.bufferBelow?.length ?? 0;
  const strip = new Array<string | undefined>(
    bufferAbove + target.visible.length + belowLength,
  );
  for (let i = 0; i < strip.length; i++) {
    strip[i] = getTargetSlot(target, i - bufferAbove);
  }
  return strip;
}

/** Deep-clone a `ColumnTarget` one level down, so slots can be rewritten safely. */
export function cloneColumnTarget(target: ColumnTarget): ColumnTarget {
  return {
    visible: [...target.visible],
    bufferAbove: target.bufferAbove ? [...target.bufferAbove] : undefined,
    bufferBelow: target.bufferBelow ? [...target.bufferBelow] : undefined,
  };
}

/**
 * Validate that a target grid does not carry more `bufferAbove` / `bufferBelow`
 * entries than the engine can consume. Throws a `RangeError` with a
 * column-pointing message if it does; otherwise a no-op.
 *
 * Background: without this check the failure is silent. `columnTargetToStrip`
 * only lays down as many buffer slots as the reel actually has, so an entry
 * past that capacity never reaches the strip. Failing here at the entry point
 * is cheaper than a "why did not my target land" debugging session.
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
    // Validate by the highest DEFINED index, not raw `.length`. A sparse array
    // (e.g. ['X', undefined, undefined], as serializers that pre-size arrays
    // produce) materializes only its defined entries, so its length must not
    // trip the guard. A defined entry at index >= max IS dropped downstream
    // (only slots 0..max-1 are consumed), so that index is the real ceiling.
    const aboveMax = highestDefinedIndex(item.bufferAbove);
    const belowMax = highestDefinedIndex(item.bufferBelow);
    if (aboveMax >= maxAbove) {
      throw new RangeError(
        `${callerLabel} column ${c}: bufferAbove has a symbol at index ${aboveMax}, ` +
        `beyond engine bufferSymbols=${maxAbove}; it would be silently dropped. ` +
        `Increase bufferSymbols(...) on the builder or remove the extra entry.`,
      );
    }
    if (belowMax >= maxBelow) {
      throw new RangeError(
        `${callerLabel} column ${c}: bufferBelow has a symbol at index ${belowMax}, ` +
        `beyond engine bufferSymbols=${maxBelow}; it would be silently dropped. ` +
        `Increase bufferSymbols(...) on the builder or remove the extra entry.`,
      );
    }
  }
}

/** Highest index holding a defined value, or -1 if the array is empty/undefined. */
function highestDefinedIndex(arr: (string | undefined)[] | undefined): number {
  if (!arr) return -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== undefined) return i;
  }
  return -1;
}
