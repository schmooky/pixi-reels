import type { Payline } from '../config/types.js';
import type { SymbolPosition } from '../events/ReelEvents.js';

export type { Payline };

/**
 * Expand a `Payline` into an ordered list of cell positions, skipping any
 * `null` entries (reels the payline doesn't touch).
 *
 * ```ts
 * paylineToCells({ lineId: 0, line: [1, 1, null, 1, 1], value: 50 })
 * // → [{reel:0,row:1}, {reel:1,row:1}, {reel:3,row:1}, {reel:4,row:1}]
 * ```
 */
export function paylineToCells(payline: Payline): SymbolPosition[] {
  const cells: SymbolPosition[] = [];
  for (let reelIndex = 0; reelIndex < payline.line.length; reelIndex++) {
    const rowIndex = payline.line[reelIndex];
    if (rowIndex === null || rowIndex === undefined) continue;
    cells.push({ reelIndex, rowIndex });
  }
  return cells;
}

/** Return a new array sorted by `value` descending (non-mutating). */
export function sortByValueDesc(paylines: readonly Payline[]): Payline[] {
  return [...paylines].sort((a, b) => b.value - a.value);
}
