import { describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import { createTestReelSet } from '../../src/testing/index.js';

/**
 * `reelSet.destroy()` must leave nothing of its own running on the gsap
 * timeline.
 *
 * Spin phases (start ramp, anticipation, stop bounce, cascade fall/drop-in)
 * each own a gsap timeline that mutates reel speed and symbol view
 * positions. `SpinController.destroy()` used to `_activePhases.clear()`
 * without skipping the phases first, so those timelines outlived the set and
 * kept writing to display objects that `super.destroy({ children: true })`
 * had already freed.
 *
 * On a page that drives gsap from a PixiJS ticker (the documented
 * hidden-tab pattern) the tweens do not even stop when the set's own app
 * goes away -- any other live ticker keeps advancing the shared root
 * timeline. That is the real-consumer shape of this: destroy a reel set
 * mid-spin, keep the page alive, and orphaned tweens write to freed objects.
 */

/** Tween/timeline handles currently parented to gsap's root timeline. */
function rootChildren(): object[] {
  return gsap.globalTimeline.getChildren(true, true, true) as unknown as object[];
}

const SYMBOL_IDS = ['cherry', 'lemon', 'seven'];

describe('destroy() mid-spin', () => {
  it('leaves no gsap tweens of its own running', () => {
    const before = new Set(rootChildren());

    const { reelSet, advance } = createTestReelSet({
      reels: 5,
      visibleCells: 3,
      symbolIds: SYMBOL_IDS,
    });

    // Float the spin promise: it never settles here (the set dies first),
    // and an unhandled rejection would fail the run for the wrong reason.
    void reelSet.spin().catch(() => { /* set destroyed mid-spin */ });
    // Far enough in for the staggered start ramps to be live, not so far
    // that they have all completed.
    advance(50);

    const during = rootChildren().filter((t) => !before.has(t));
    expect(during.length, 'no spin tweens were running, so the test proves nothing')
      .toBeGreaterThan(0);

    reelSet.destroy();

    const leaked = rootChildren().filter((t) => !before.has(t));
    expect(leaked, 'destroy() left tweens on the gsap root timeline').toEqual([]);
  });
});
