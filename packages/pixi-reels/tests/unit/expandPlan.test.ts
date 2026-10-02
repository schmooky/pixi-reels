/**
 * `planExpandSteps`: how `expand()` splits the new columns into steps. Pure,
 * so every big-symbol layout can be walked without a reel set.
 */
import { describe, it, expect } from 'vitest';
import { planExpandSteps } from '../../src/core/expand.js';
import type { SymbolData } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const DATA: Record<string, SymbolData> = {
  a: { weight: 1 },
  wide: { weight: 0, size: { reels: 2, cells: 1 } },
  square: { weight: 0, size: { reels: 2, cells: 2 } },
  giant: { weight: 0, size: { reels: 3, cells: 3 } },
  tall: { weight: 0, size: { reels: 1, cells: 3 } },
};

const col = (...visible: string[]): ColumnTarget => ({ visible });
const plain = (n: number): ColumnTarget[] => Array.from({ length: n }, () => col('a', 'a', 'a'));
const plan = (columns: ColumnTarget[], step?: Parameters<typeof planExpandSteps>[1]) =>
  planExpandSteps(columns, step, DATA, 1, 1, 5);

describe('planExpandSteps', () => {
  it('splits by the step size, the last step taking what is left', () => {
    expect(plan(plain(4))).toEqual([1, 1, 1, 1]);
    expect(plan(plain(5), 2)).toEqual([2, 2, 1]);
    expect(plan(plain(3), 10)).toEqual([3]);
    expect(plan([])).toEqual([]);
  });

  it('asks a step function with the step index, its first reel and what remains', () => {
    const seen: unknown[] = [];
    const out = plan(plain(4), (info) => {
      seen.push(info);
      return 3;
    });
    expect(out).toEqual([3, 1]);
    expect(seen).toEqual([
      { index: 0, from: 5, remaining: 4 },
      { index: 1, from: 8, remaining: 1 },
    ]);
  });

  it('widens a step to take a block whole: +2 for a 2-wide symbol', () => {
    expect(plan([col('wide', 'a', 'a'), col('a', 'a', 'a'), col('a', 'a', 'a')])).toEqual([2, 1]);
    expect(plan([col('a', 'a', 'a'), col('square', 'a', 'a'), col('a', 'a', 'a')])).toEqual([1, 2]);
    expect(plan([col('giant', 'a', 'a'), ...plain(4)])).toEqual([3, 1, 1]);
  });

  it('a block in a widened step can widen it again', () => {
    // wide at 0 pulls in 1; wide at 1 pulls in 2.
    const columns = [col('wide', 'a', 'a'), col('a', 'wide', 'a'), col('a', 'a', 'a'), col('a', 'a', 'a')];
    expect(plan(columns)).toEqual([3, 1]);
  });

  it('a step already wide enough is left alone', () => {
    expect(plan([col('wide', 'a', 'a'), col('a', 'a', 'a'), col('a', 'a', 'a')], 2)).toEqual([2, 1]);
  });

  it('a 1-wide tall block never widens a step', () => {
    expect(plan([col('tall', 'a', 'a'), col('a', 'a', 'a')])).toEqual([1, 1]);
  });

  it('reads blocks from the buffers too', () => {
    const columns: ColumnTarget[] = [{ visible: ['a', 'a', 'a'], bufferStart: ['wide'] }, col('a', 'a', 'a')];
    expect(plan(columns)).toEqual([2]);
  });

  it('skips cells under an earlier block, so a replayed block is one block', () => {
    // `getTargets()` replays a 2x2 as its id in all four cells.
    const columns = [col('square', 'square', 'a'), col('square', 'square', 'a'), col('a', 'a', 'a')];
    expect(plan(columns)).toEqual([2, 1]);
  });

  it('throws when a block reaches past the last new reel', () => {
    expect(() => plan([col('a', 'a', 'a'), col('wide', 'a', 'a')])).toThrow(
      /'wide' \(2x1\) anchored on new reel 6 reaches reel 7, past the last reel this expansion adds \(6\)/,
    );
  });

  it('throws when a block runs past the bottom of a strip it covers', () => {
    // bufferEnd 1: a 2-tall block anchored on visible cell 2 fits (2 + 2 <= 3 + 1)...
    expect(plan([col('a', 'a', 'square'), col('a', 'a', 'a')])).toEqual([2]);
    // ...on the buffer slot below it, it does not.
    expect(() => plan([{ visible: ['a', 'a', 'a'], bufferEnd: ['square'] }, col('a', 'a', 'a')])).toThrow(
      /runs past the bottom of reel 5's strip/,
    );
    // A shorter neighbour is checked too.
    expect(() => plan([col('a', 'a', 'square'), col('a', 'a')])).toThrow(/runs past the bottom of reel 6's strip/);
  });

  it('rejects a step that is not a whole positive number', () => {
    expect(() => plan(plain(2), 0)).toThrow(/at least 1 \(got 0\)/);
    expect(() => plan(plain(2), () => 1.5)).toThrow(/got 1.5/);
  });
});
