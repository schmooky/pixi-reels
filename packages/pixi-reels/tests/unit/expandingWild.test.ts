import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';

describe('expanding wild (pin-based, 1×N)', () => {
  it('pins fill a column for one spin via pin overlay (eval pin)', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'wild'],
    });
    try {
      // Expanding wild: pin every cell in column 1 for 'eval' lifetime.
      // Pins must be placed AFTER spin() starts — 'eval' pins from the
      // previous spin are cleared at the next spin:start.
      const promise = reelSet.spin();
      for (let r = 0; r < 3; r++) {
        reelSet.pin(1, r, 'wild', { turns: 'eval' });
      }
      reelSet.setResult([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      reelSet.skip();
      await promise;
      expectGrid(reelSet, [
        ['a', 'a', 'a'],
        ['wild', 'wild', 'wild'],
        ['a', 'a', 'a'],
      ]);
      // 'eval' pins cleared at the next spin start. Spin again to confirm.
      await spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      expectGrid(reelSet, [
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
    } finally {
      destroy();
    }
  });
});
