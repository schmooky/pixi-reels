import { describe, it, expect } from 'vitest';
import {
  assertBufferCountsInRange,
  cloneColumnTarget,
  columnTargetToStrip,
  getTargetSlot,
  setTargetSlot,
  type ColumnTarget,
} from '../../src/frame/ColumnTarget.js';

describe('getTargetSlot', () => {
  const target: ColumnTarget = {
    visible: ['a', 'b', 'c'],
    bufferAbove: ['above1', 'above2'],
    bufferBelow: ['below1', 'below2'],
  };

  it('reads visible rows at non-negative indices', () => {
    expect(getTargetSlot(target, 0)).toBe('a');
    expect(getTargetSlot(target, 2)).toBe('c');
  });

  it('reads bufferAbove at negative rows, closest cell at -1', () => {
    expect(getTargetSlot(target, -1)).toBe('above1');
    expect(getTargetSlot(target, -2)).toBe('above2');
  });

  it('reads bufferBelow at rows past visible.length', () => {
    expect(getTargetSlot(target, 3)).toBe('below1');
    expect(getTargetSlot(target, 4)).toBe('below2');
  });

  it('returns undefined for rows the target does not specify', () => {
    expect(getTargetSlot({ visible: ['a'] }, -1)).toBeUndefined();
    expect(getTargetSlot({ visible: ['a'] }, 1)).toBeUndefined();
    expect(getTargetSlot(target, -3)).toBeUndefined();
    expect(getTargetSlot(target, 5)).toBeUndefined();
  });
});

describe('setTargetSlot', () => {
  it('writes visible rows in place', () => {
    const t: ColumnTarget = { visible: ['a', 'b'] };
    setTargetSlot(t, 1, 'X');
    expect(t.visible).toEqual(['a', 'X']);
  });

  it('creates bufferAbove on demand for negative rows', () => {
    const t: ColumnTarget = { visible: ['a', 'b'] };
    setTargetSlot(t, -2, 'X');
    expect(getTargetSlot(t, -2)).toBe('X');
    expect(t.bufferAbove?.[1]).toBe('X');
  });

  it('creates bufferBelow on demand for rows past the visible window', () => {
    const t: ColumnTarget = { visible: ['a', 'b'] };
    setTargetSlot(t, 3, 'X');
    expect(getTargetSlot(t, 3)).toBe('X');
    expect(t.bufferBelow?.[1]).toBe('X');
  });
});

describe('columnTargetToStrip', () => {
  it('lays the visible window out after the buffer-above slots', () => {
    const strip = columnTargetToStrip({ visible: ['a', 'b', 'c'] }, 1);
    expect(strip).toEqual([undefined, 'a', 'b', 'c']);
  });

  it('orders bufferAbove furthest-cell-first', () => {
    const strip = columnTargetToStrip(
      { visible: ['a', 'b', 'c'], bufferAbove: ['above1', 'above2'] },
      2,
    );
    expect(strip).toEqual(['above2', 'above1', 'a', 'b', 'c']);
  });

  it('appends bufferBelow after the visible window', () => {
    const strip = columnTargetToStrip(
      { visible: ['a', 'b'], bufferBelow: ['below1'] },
      1,
    );
    expect(strip).toEqual([undefined, 'a', 'b', 'below1']);
  });

  it('drops bufferAbove entries past the reel capacity', () => {
    const strip = columnTargetToStrip(
      { visible: ['a'], bufferAbove: ['above1', 'above2'] },
      1,
    );
    expect(strip).toEqual(['above1', 'a']);
  });

  it('preserves holes so the caller can random-fill them', () => {
    const strip = columnTargetToStrip(
      { visible: ['a', 'b'], bufferBelow: [undefined, 'below2'] },
      0,
    );
    expect(strip).toEqual(['a', 'b', undefined, 'below2']);
  });
});

describe('cloneColumnTarget', () => {
  it('copies buffers so slot writes do not reach the original', () => {
    const original: ColumnTarget = {
      visible: ['a'],
      bufferAbove: ['above1'],
      bufferBelow: ['below1'],
    };
    const copy = cloneColumnTarget(original);
    setTargetSlot(copy, 0, 'X');
    setTargetSlot(copy, -1, 'Y');
    setTargetSlot(copy, 1, 'Z');
    expect(original.visible).toEqual(['a']);
    expect(original.bufferAbove).toEqual(['above1']);
    expect(original.bufferBelow).toEqual(['below1']);
  });

  it('leaves absent buffers absent', () => {
    const copy = cloneColumnTarget({ visible: ['a'] });
    expect(copy.bufferAbove).toBeUndefined();
    expect(copy.bufferBelow).toBeUndefined();
  });
});

describe('assertBufferCountsInRange', () => {
  const aboveOne = [1, 1, 1];
  const belowOne = [1, 1, 1];

  it('passes when all columns are within bounds', () => {
    const grid: ColumnTarget[] = [
      { visible: ['a', 'b', 'c'] },
      { visible: ['a', 'b', 'c'], bufferAbove: ['X'] },
      { visible: ['a', 'b', 'c'], bufferBelow: ['Y'] },
    ];
    expect(() =>
      assertBufferCountsInRange(grid, aboveOne, belowOne, 'setResult'),
    ).not.toThrow();
  });

  it('throws when bufferAbove length exceeds engine count', () => {
    const grid: ColumnTarget[] = [
      { visible: ['a', 'b', 'c'] },
      { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
      { visible: ['a', 'b', 'c'] },
    ];
    expect(() =>
      assertBufferCountsInRange(grid, aboveOne, belowOne, 'setResult'),
    ).toThrowError(/setResult column 1: bufferAbove has a symbol at index 1, beyond engine bufferSymbols=1/);
  });

  it('throws when bufferBelow length exceeds engine count', () => {
    const grid: ColumnTarget[] = [
      { visible: ['a', 'b', 'c'] },
      { visible: ['a', 'b', 'c'], bufferBelow: ['X', 'Y'] },
      { visible: ['a', 'b', 'c'] },
    ];
    expect(() =>
      assertBufferCountsInRange(grid, aboveOne, belowOne, 'setResult'),
    ).toThrowError(/setResult column 1: bufferBelow has a symbol at index 1, beyond engine bufferSymbols=1/);
  });

  it('uses the supplied callerLabel in the message', () => {
    const grid: ColumnTarget[] = [{ visible: ['a'], bufferAbove: ['X', 'Y'] }];
    expect(() =>
      assertBufferCountsInRange(grid, [1], [1], 'initialFrame'),
    ).toThrowError(/^initialFrame column 0: bufferAbove/);
  });

  it('handles per-reel buffer counts that vary by index', () => {
    const grid: ColumnTarget[] = [
      { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
      { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
    ];
    expect(() =>
      assertBufferCountsInRange(grid, [2, 1], [1, 1], 'setResult'),
    ).toThrowError(/setResult column 1: bufferAbove has a symbol at index 1, beyond engine bufferSymbols=1/);
  });

  it('no-op for empty grid', () => {
    expect(() => assertBufferCountsInRange([], [], [], 'setResult')).not.toThrow();
  });

  it('counts the highest DEFINED index, not raw length (sparse array passes) [M9]', () => {
    // length 3 but only index 0 is defined -> a single entry materializes.
    const grid: ColumnTarget[] = [
      { visible: ['a', 'b', 'c'], bufferAbove: ['X', undefined, undefined] },
    ];
    expect(() => assertBufferCountsInRange(grid, [1], [1], 'setResult')).not.toThrow();
  });

  it('still throws when a defined entry sits beyond the buffer range (sparse) [M9]', () => {
    // ['X', undefined, 'Y'] with bufferSymbols=2 -> 'Y' at index 2 would be dropped.
    const grid: ColumnTarget[] = [
      { visible: ['a'], bufferAbove: ['X', undefined, 'Y'] },
    ];
    expect(() =>
      assertBufferCountsInRange(grid, [2], [2], 'setResult'),
    ).toThrowError(/bufferAbove has a symbol at index 2, beyond engine bufferSymbols=2/);
  });
});
