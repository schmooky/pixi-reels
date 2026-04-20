import { describe, it, expect } from 'vitest';
import {
  createTestReelSet,
  expectGrid,
  countSymbol,
  captureEvents,
} from '../../../src/testing/index.js';

describe('createTestReelSet', () => {
  it('builds a reel set with configured dimensions', () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      expect(h.reelSet.reels.length).toBe(5);
      expect(h.reelSet.reels[0].getVisibleSymbols().length).toBe(3);
    } finally {
      h.destroy();
    }
  });

  it('spinAndLand deterministically lands the target grid', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const grid: string[][] = [
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ];
      const result = await h.spinAndLand(grid);
      expect(result.wasSkipped).toBe(true);
      expectGrid(h.reelSet, grid);
    } finally {
      h.destroy();
    }
  });

  it('emits the full spin event sequence', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const log = captureEvents(h.reelSet, [
        'spin:start',
        'skip:requested',
        'skip:completed',
        'spin:complete',
      ]);
      await h.spinAndLand([
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ]);
      const names = log.map((e) => e.event);
      expect(names).toEqual([
        'spin:start',
        'skip:requested',
        'spin:complete',
        'skip:completed',
      ]);
    } finally {
      h.destroy();
    }
  });

  it('countSymbol returns the correct visible count', async () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['x', 'y'] });
    try {
      await h.spinAndLand([
        ['x', 'x', 'x'],
        ['y', 'y', 'y'],
        ['x', 'y', 'x'],
        ['y', 'y', 'y'],
        ['x', 'x', 'x'],
      ]);
      expect(countSymbol(h.reelSet, 'x')).toBe(8);
      expect(countSymbol(h.reelSet, 'y')).toBe(7);
    } finally {
      h.destroy();
    }
  });

  it('expectGrid throws a readable error on mismatch', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a', 'b'] });
    try {
      await h.spinAndLand([
        ['a', 'a'],
        ['b', 'b'],
      ]);
      expect(() =>
        expectGrid(h.reelSet, [
          ['a', 'b'],
          ['b', 'b'],
        ]),
      ).toThrow(/Grid mismatch/);
    } finally {
      h.destroy();
    }
  });

  it('advance() fires ticker callbacks', () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    try {
      const before = h.ticker.elapsedMS;
      h.advance(80);
      expect(h.ticker.elapsedMS).toBeGreaterThan(before);
    } finally {
      h.destroy();
    }
  });
});
