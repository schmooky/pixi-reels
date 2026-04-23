import type { ClusterWin, Payline, SymbolPosition, Win } from '../config/types.js';

export type { Payline, ClusterWin, Win };

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

/** Discriminator — true if the win carries a `line` (payline-shaped). */
export function isPayline(win: Win): win is Payline {
  return Array.isArray((win as Payline).line);
}

/** Discriminator — true if the win carries a `cells` array (cluster-shaped). */
export function isCluster(win: Win): win is ClusterWin {
  return Array.isArray((win as ClusterWin).cells);
}

/**
 * Extract the cells of a win regardless of shape. `Payline.line` is
 * expanded skipping nulls; `ClusterWin.cells` is returned as-is (copied
 * to a fresh array so callers can mutate freely).
 */
export function winToCells(win: Win): SymbolPosition[] {
  if (isPayline(win)) return paylineToCells(win);
  const cells = (win as ClusterWin).cells;
  const out: SymbolPosition[] = [];
  for (const c of cells) out.push({ reelIndex: c.reelIndex, rowIndex: c.rowIndex });
  return out;
}

/** Return a new array sorted by `value` descending (non-mutating). */
export function sortByValueDesc<T extends { value: number }>(wins: readonly T[]): T[] {
  return [...wins].sort((a, b) => b.value - a.value);
}

