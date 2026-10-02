/**
 * The pay-ways stand-in the docs site and the expansion tests use
 * (`@pixi-reels/cheats/ways`). Not library API (ADR 007), but the recipes
 * draw what it returns, so it has to be right.
 */
import { describe, it, expect } from 'vitest';
import { countWays, evaluateWays } from '@pixi-reels/cheats/ways';

describe('countWays', () => {
  it('multiplies the cells per reel', () => {
    expect(countWays([3, 3, 3, 3, 3])).toBe(243);
    expect(countWays([2, 3, 4, 5, 6, 7])).toBe(5040);
    expect(countWays(Array(8).fill(7))).toBe(5_764_801);
    expect(countWays([])).toBe(0);
  });
});

describe('evaluateWays', () => {
  it('pays a symbol on consecutive reels from the left, counting every matching cell', () => {
    const grid = [
      ['a', 'b', 'a'],
      ['a', 'c', 'c'],
      ['b', 'a', 'a'],
      ['c', 'c', 'c'],
    ];
    const [win, ...rest] = evaluateWays(grid);
    expect(rest).toEqual([]);
    expect(win).toMatchObject({ kind: 'ways', symbol: 'a', reels: 3, ways: 4, value: 4 });
    expect(win.perReel).toEqual([[0, 2], [0], [1, 2]]);
    expect(win.cells).toEqual([
      { reelIndex: 0, cellIndex: 0 },
      { reelIndex: 0, cellIndex: 2 },
      { reelIndex: 1, cellIndex: 0 },
      { reelIndex: 2, cellIndex: 1 },
      { reelIndex: 2, cellIndex: 2 },
    ]);
  });

  it('stops at the first reel without the symbol, and needs minReels', () => {
    const grid = [['a'], ['a'], ['b'], ['a'], ['a']];
    expect(evaluateWays(grid)).toEqual([]);
    expect(evaluateWays(grid, { minReels: 2 })[0]).toMatchObject({ symbol: 'a', reels: 2, ways: 1 });
  });

  it('wilds substitute, but never win on their own', () => {
    const grid = [
      ['wild', 'b'],
      ['wild', 'wild'],
      ['c', 'b'],
      ['c', 'd'],
    ];
    const wins = evaluateWays(grid, { wilds: ['wild'] });
    expect(wins.map((w) => [w.symbol, w.reels, w.ways])).toEqual([
      ['b', 3, 4],
      ['c', 4, 2],
    ]);
    // An all-wild run does not pay the wild.
    expect(evaluateWays([['wild'], ['wild'], ['wild']], { wilds: ['wild'] })).toEqual([]);
  });

  it('a symbol first seen after a run of wilds still wins', () => {
    const grid = [['wild'], ['wild'], ['a'], ['b']];
    expect(evaluateWays(grid, { wilds: ['wild'] })[0]).toMatchObject({ symbol: 'a', reels: 3, ways: 1 });
  });

  it('excluded symbols never pay', () => {
    expect(evaluateWays([['s'], ['s'], ['s']], { exclude: ['s'] })).toEqual([]);
  });

  it('values wins with the pay table and sorts best first', () => {
    const grid = [
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
    ];
    const wins = evaluateWays(grid, { pays: (s, reels) => (s === 'b' ? 10 : 1) * reels });
    expect(wins.map((w) => [w.symbol, w.value])).toEqual([
      ['b', 30],
      ['a', 3],
    ]);
  });

  it('scales to a long MultiWays board without enumerating ways', () => {
    const grid = Array.from({ length: 12 }, () => Array(7).fill('a'));
    const [win] = evaluateWays(grid);
    expect(win.ways).toBe(7 ** 12);
    expect(win.cells).toHaveLength(84);
  });
});
