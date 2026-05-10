import { describe, expect, it } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/index.js';

describe('ReelSet.requestSkip — pre-result-safe slam-stop', () => {
  it('queues until setResult and lands on the target grid (not buffer)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });

    const grid = [
      ['a', 'b', 'c'],
      ['c', 'a', 'b'],
      ['b', 'c', 'a'],
    ];

    const promise = h.reelSet.spin();
    h.advance(50);
    h.reelSet.requestSkip();
    h.advance(50);
    expect(h.reelSet.isSpinning).toBe(true);

    h.reelSet.setResult(grid);
    await promise;

    expectGrid(h.reelSet, grid);
    expect(h.reelSet.isSpinning).toBe(false);
    h.destroy();
  });

  it('falls through to skip() when result is already set', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b'] });

    const grid = [
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'b', 'a'],
    ];

    const promise = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.requestSkip();
    await promise;

    expectGrid(h.reelSet, grid);
    h.destroy();
  });

  it('is a no-op when not spinning', () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    expect(() => h.reelSet.requestSkip()).not.toThrow();
    expect(h.reelSet.isSpinning).toBe(false);
    h.destroy();
  });
});
