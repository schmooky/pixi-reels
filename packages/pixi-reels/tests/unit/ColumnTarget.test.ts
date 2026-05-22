import { describe, it, expect } from 'vitest';
import { columnTargetToArray } from '../../src/frame/ColumnTarget.js';

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
