import { describe, expect, it } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

/**
 * A refill that lands the SAME symbol id a cell already holds takes the fast
 * path in `Reel._replaceSymbol`: the instance is reused without
 * `deactivate()` / `activate()`, so nothing resets its animation pose.
 *
 * That path resets `view.alpha`, `view.scale`, `view.rotation`, `view.filters`
 * and `view.zIndex` -- everything the reel itself owns. It cannot reset what
 * the symbol class drives internally, and after `playWin()` that is exactly
 * where the leftover state lives: a Spine skeleton parked on the final frame
 * of a one-shot win, or a nested container the class faded out itself.
 *
 * The visible result is a cell that holds a symbol but draws nothing. It only
 * reproduces on a same-id refill, which is why it reads as "some symbols
 * randomly vanish after a collapse".
 *
 * `stopAnimation()` is the documented "spotlight is over, return to idle"
 * hook. `deactivate()` and `destroy()` already call it, so this makes the
 * same-id path agree with every other path that hands a symbol back.
 */
describe('same-id refill returns the symbol to rest', () => {
  it('calls stopAnimation when a cell is refilled with the same id', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleCells: 3,
      symbolIds: ['a'],
    });

    try {
      const reel = reelSet.reels[0]!;
      const before = reel.getSymbolAt(0) as HeadlessSymbol;

      let stops = 0;
      const original = before.stopAnimation.bind(before);
      before.stopAnimation = () => {
        stops += 1;
        original();
      };

      await spinAndLand([{ visible: ['a', 'a', 'a'] }]);

      // Fast path: the very same instance, never deactivated.
      expect(reel.getSymbolAt(0)).toBe(before);
      expect(stops).toBeGreaterThan(0);
    } finally {
      destroy();
    }
  });
});
