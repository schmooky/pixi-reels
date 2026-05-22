import { describe, it, expect } from 'vitest';
import {
  assertBufferCountsInRange,
  columnTargetToArray,
  type ColumnTarget,
} from '../../src/frame/ColumnTarget.js';

describe('columnTargetToArray', () => {
  it('materializes visible only', () => {
    const arr = columnTargetToArray({ visible: ['a', 'b', 'c'] });
    expect(arr).toEqual(['a', 'b', 'c']);
  });

  it('materializes bufferBelow as numeric indices at and after visible.length', () => {
    const arr = columnTargetToArray({
      visible: ['a', 'b', 'c'],
      bufferBelow: ['below1', 'below2'],
    });
    expect(arr[3]).toBe('below1');
    expect(arr[4]).toBe('below2');
  });

  it('skips undefined entries inside bufferBelow', () => {
    const arr = columnTargetToArray({
      visible: ['a', 'b'],
      bufferBelow: [undefined, 'below2'],
    });
    expect(arr[2]).toBeUndefined();
    expect(arr[3]).toBe('below2');
  });

  it('returns an array whose numeric length matches visible.length when only bufferAbove is set', () => {
    const arr = columnTargetToArray({
      visible: ['a', 'b', 'c'],
      bufferAbove: ['above1', 'above2'],
    });
    expect(arr.length).toBe(3);
    expect([arr[0], arr[1], arr[2]]).toEqual(['a', 'b', 'c']);
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
    ).toThrowError(/setResult column 1: bufferAbove has 2 entries but engine bufferSymbols=1/);
  });

  it('throws when bufferBelow length exceeds engine count', () => {
    const grid: ColumnTarget[] = [
      { visible: ['a', 'b', 'c'] },
      { visible: ['a', 'b', 'c'], bufferBelow: ['X', 'Y'] },
      { visible: ['a', 'b', 'c'] },
    ];
    expect(() =>
      assertBufferCountsInRange(grid, aboveOne, belowOne, 'setResult'),
    ).toThrowError(/setResult column 1: bufferBelow has 2 entries but engine bufferSymbols=1/);
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
    ).toThrowError(/setResult column 1: bufferAbove has 2 entries but engine bufferSymbols=1/);
  });

  it('no-op for empty grid', () => {
    expect(() => assertBufferCountsInRange([], [], [], 'setResult')).not.toThrow();
  });
});
