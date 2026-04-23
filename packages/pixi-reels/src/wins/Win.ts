import type { SymbolPosition, Win } from '../config/types.js';

export type { Win, SymbolPosition };

/** Return a new array sorted by `value` descending (non-mutating). Missing values sort as 0. */
export function sortByValueDesc<T extends { value?: number }>(wins: readonly T[]): T[] {
  return [...wins].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
