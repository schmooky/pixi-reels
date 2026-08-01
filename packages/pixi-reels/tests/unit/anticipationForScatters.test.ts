/**
 * anticipationForScatters - pick the tease reels straight from a result grid.
 */
import { describe, it, expect } from 'vitest';
import { anticipationForScatters } from '../../src/spin/anticipationRecipes.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

// 5x3 grid helper (ColumnTarget[], same shape setResult takes). `scatterReels`
// lists which reels get one SCAT (row 1).
function grid(scatterReels: number[]): ColumnTarget[] {
  return Array.from({ length: 5 }, (_, r) => {
    const visible = ['a', 'a', 'a'];
    if (scatterReels.includes(r)) visible[1] = 'SCAT';
    return { visible };
  });
}

describe('anticipationForScatters', () => {
  it('teases every reel after the trigger reel (all-remaining, default)', () => {
    // SCAT on reels 0 and 1 -> 2 scatters reached at reel 1 -> tease [2,3,4].
    expect(anticipationForScatters(grid([0, 1]), { symbol: 'SCAT' })).toEqual([2, 3, 4]);
  });

  it("'scatter-only' teases only remaining reels that hold the symbol", () => {
    // SCAT on reels 0,1,3 -> trigger at reel 1 -> candidates [2,3,4] -> only [3].
    expect(
      anticipationForScatters(grid([0, 1, 3]), { symbol: 'SCAT', mode: 'scatter-only' }),
    ).toEqual([3]);
  });

  it('returns [] when the trigger count is never reached', () => {
    // Only 1 scatter, trigger defaults to 2 -> no tease.
    expect(anticipationForScatters(grid([2]), { symbol: 'SCAT' })).toEqual([]);
  });

  it('honors a custom trigger threshold', () => {
    // SCAT on reels 0,1,2; trigger 3 reached at reel 2 -> tease [3,4].
    expect(
      anticipationForScatters(grid([0, 1, 2]), { symbol: 'SCAT', trigger: 3 }),
    ).toEqual([3, 4]);
  });

  it('counts multiple symbols on the same reel', () => {
    // Two SCAT on reel 0 alone reaches trigger 2 at reel 0 -> tease [1,2,3,4].
    const g = grid([]);
    g[0] = { visible: ['SCAT', 'SCAT', 'a'] };
    expect(anticipationForScatters(g, { symbol: 'SCAT' })).toEqual([1, 2, 3, 4]);
  });

  it('does not count buffer cells (ColumnTarget form)', () => {
    // A SCAT parked in bufferEnd is off-screen and must not trigger tension.
    const targets: ColumnTarget[] = [
      { visible: ['a', 'SCAT', 'a'] },
      { visible: ['a', 'a', 'a'], bufferEnd: ['SCAT'] }, // off-screen, ignored
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
    ];
    // Only 1 VISIBLE scatter -> trigger 2 not reached -> [].
    expect(anticipationForScatters(targets, { symbol: 'SCAT' })).toEqual([]);
  });

  it('accepts the ColumnTarget form and scans visible cells', () => {
    const targets: ColumnTarget[] = [
      { visible: ['a', 'SCAT', 'a'] },
      { visible: ['SCAT', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
    ];
    expect(anticipationForScatters(targets, { symbol: 'SCAT' })).toEqual([2, 3, 4]);
  });
});
