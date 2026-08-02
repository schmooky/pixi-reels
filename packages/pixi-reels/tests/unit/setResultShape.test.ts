import { describe, expect, it } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

/**
 * `setResult` takes `ColumnTarget[]`. Handing it the pre-v2 `string[][]` used
 * to reach a spread of `target.visible` deep in the frame pipeline and throw
 * `TypeError: target.visible is not iterable` -- AFTER the reels were already
 * moving, so the spin promise never settled and the reel span forever with no
 * usable clue. A recipe on the docs site shipped exactly that: its banner
 * never stopped.
 */
describe('setResult argument shape', () => {
  const build = () =>
    createTestReelSet({ reels: 1, visibleCells: 5, symbolIds: ['a', 'b'] });

  it('names the fix when handed string[][]', () => {
    const { reelSet, destroy } = build();
    try {
      reelSet.spin();
      expect(() => (reelSet as never as { setResult(v: unknown): void })
        .setResult([['a', 'b', 'a', 'b', 'a']]))
        .toThrow(/column 0 is a plain string\[\].*grid\.map/s);
    } finally {
      reelSet.slamStop();
      destroy();
    }
  });

  it('names the fix when a column has no visible array', () => {
    const { reelSet, destroy } = build();
    try {
      reelSet.spin();
      expect(() => (reelSet as never as { setResult(v: unknown): void })
        .setResult([{ cells: ['a'] }]))
        .toThrow(/column 0 has no 'visible' array/);
    } finally {
      reelSet.slamStop();
      destroy();
    }
  });

  it('still accepts a proper ColumnTarget[]', async () => {
    const { reelSet, spinAndLand, destroy } = build();
    try {
      await spinAndLand([{ visible: ['a', 'b', 'a', 'b', 'a'] }]);
      expect(reelSet.getVisibleGrid()[0]).toEqual(['a', 'b', 'a', 'b', 'a']);
    } finally {
      destroy();
    }
  });
});
