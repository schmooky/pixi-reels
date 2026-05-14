import { describe, it, expect } from 'vitest';
import {
  cloneColumn,
  cloneTargetGrid,
  columnTargetToArray,
  isColumnTargetGrid,
  toLegacyTargetGrid,
  type ColumnTarget,
} from '../../src/frame/ColumnTarget.js';

describe('ColumnTarget helpers', () => {
  describe('cloneColumn', () => {
    it('preserves the regular numeric entries', () => {
      const src = ['a', 'b', 'c'];
      const out = cloneColumn(src, 0);
      expect(out).toEqual(['a', 'b', 'c']);
      expect(out).not.toBe(src);
    });

    it('preserves negative-index slots within bufferAbove', () => {
      const src = ['a', 'b', 'c'];
      (src as Record<number, string>)[-1] = 'above1';
      (src as Record<number, string>)[-2] = 'above2';
      const out = cloneColumn(src, 2);
      expect((out as Record<number, string>)[-1]).toBe('above1');
      expect((out as Record<number, string>)[-2]).toBe('above2');
    });

    it('drops negative-index slots beyond bufferAbove', () => {
      const src = ['a', 'b', 'c'];
      (src as Record<number, string>)[-1] = 'above1';
      (src as Record<number, string>)[-2] = 'above2';
      const out = cloneColumn(src, 1); // only -1 is in range
      expect((out as Record<number, string>)[-1]).toBe('above1');
      expect((out as Record<number, string>)[-2]).toBeUndefined();
    });
  });

  describe('cloneTargetGrid', () => {
    it('clones every column preserving negative-index slots', () => {
      const grid: string[][] = [['x', 'y'], ['p', 'q']];
      (grid[0] as Record<number, string>)[-1] = 'a';
      (grid[1] as Record<number, string>)[-1] = 'b';
      const out = cloneTargetGrid(grid, 1);
      expect((out[0] as Record<number, string>)[-1]).toBe('a');
      expect((out[1] as Record<number, string>)[-1]).toBe('b');
    });
  });

  describe('isColumnTargetGrid', () => {
    it('returns true for ColumnTarget[]', () => {
      expect(isColumnTargetGrid([{ visible: ['a'] }, { visible: ['b'] }])).toBe(true);
    });

    it('returns false for string[][]', () => {
      expect(isColumnTargetGrid([['a'], ['b']])).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(isColumnTargetGrid([])).toBe(false);
    });
  });

  describe('columnTargetToArray', () => {
    it('materializes visible only', () => {
      const arr = columnTargetToArray({ visible: ['a', 'b', 'c'] });
      expect(arr).toEqual(['a', 'b', 'c']);
    });

    it('materializes bufferBelow as numeric indices >= visible.length', () => {
      const arr = columnTargetToArray({
        visible: ['a', 'b', 'c'],
        bufferBelow: ['below1'],
      });
      expect(arr[3]).toBe('below1');
    });

    it('materializes bufferAbove as negative-index slots', () => {
      const arr = columnTargetToArray({
        visible: ['a', 'b', 'c'],
        bufferAbove: ['above1', 'above2'], // [0]=closest, [1]=furthest
      });
      expect((arr as Record<number, string>)[-1]).toBe('above1');
      expect((arr as Record<number, string>)[-2]).toBe('above2');
    });

    it('handles undefined entries by skipping them', () => {
      const arr = columnTargetToArray({
        visible: ['a', 'b'],
        bufferAbove: [undefined, 'above2'],
        bufferBelow: [undefined],
      });
      expect((arr as Record<number, string>)[-1]).toBeUndefined();
      expect((arr as Record<number, string>)[-2]).toBe('above2');
      expect(arr[2]).toBeUndefined();
    });
  });

  describe('toLegacyTargetGrid', () => {
    it('returns string[][] form unchanged', () => {
      const grid: string[][] = [['a'], ['b']];
      expect(toLegacyTargetGrid(grid)).toBe(grid);
    });

    it('converts ColumnTarget[] to string[][] with negative-index slots', () => {
      const grid = [
        { visible: ['x', 'y', 'z'], bufferAbove: ['above'] },
        { visible: ['p', 'q', 'r'] },
      ];
      const out = toLegacyTargetGrid(grid);
      expect(out[0][0]).toBe('x');
      expect(out[0][1]).toBe('y');
      expect(out[0][2]).toBe('z');
      expect((out[0] as Record<number, string>)[-1]).toBe('above');
      expect((out[1] as Record<number, string>)[-1]).toBeUndefined();
    });

    it('throws a readable error when columns mix string[] and ColumnTarget', () => {
      // TypeScript blocks this at compile time; the guard catches JS callers
      // bypassing types so they fail loudly at the API entry instead of with
      // a confusing `[...col]` crash deep inside the pipeline.
      const mixed = [
        ['a', 'b', 'c'],
        { visible: ['d', 'e', 'f'] },
      ] as unknown as string[][];
      expect(() => toLegacyTargetGrid(mixed)).toThrowError(/mixed input shapes/);
    });

    it('throws when the first column is ColumnTarget and a later column is string[]', () => {
      const mixed = [
        { visible: ['a', 'b', 'c'] },
        ['d', 'e', 'f'],
      ] as unknown as ColumnTarget[];
      expect(() => toLegacyTargetGrid(mixed)).toThrowError(/mixed input shapes/);
    });

    it('handles empty array without throwing', () => {
      expect(toLegacyTargetGrid([])).toEqual([]);
    });
  });
});
