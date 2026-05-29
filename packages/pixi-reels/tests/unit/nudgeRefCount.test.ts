/**
 * M4 — the "nudge in flight" guard that blocks spin/setResult/pin must be
 * reference-counted, not a single boolean. With two parallel nudges, the first
 * to settle previously cleared the boolean and let spin() race the still-live
 * second nudge.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import { createTestReelSet } from '../../src/testing/index.js';
import { setGsap } from '../../src/utils/gsapRef.js';

/**
 * gsap.to shim that captures each tween without firing it, and lets the test
 * complete tweens one at a time by creation index. Two parallel nudges produce
 * two independent in-flight tweens.
 */
function installDeferredGsap() {
  type Slot = {
    target: { p: number };
    onUpdate?: () => void;
    onComplete?: () => void;
    done: boolean;
  };
  const slots: Slot[] = [];
  const sync = {
    ...defaultGsap,
    to: (target: { p: number }, vars: { onUpdate?: () => void; onComplete?: () => void }) => {
      slots.push({ target, onUpdate: vars.onUpdate, onComplete: vars.onComplete, done: false });
      return { kill: vi.fn(), progress: vi.fn() } as unknown as gsap.core.Tween;
    },
  } as unknown as typeof defaultGsap;
  setGsap(sync);
  return {
    fire(i: number) {
      const s = slots[i];
      if (!s || s.done) return;
      s.target.p = 1;
      s.onUpdate?.();
      s.done = true;
      s.onComplete?.();
    },
    count: () => slots.length,
  };
}

describe('nudge in-flight guard (M4)', () => {
  afterEach(() => setGsap(defaultGsap));

  it('keeps blocking spin() until the LAST parallel nudge settles', async () => {
    const deferred = installDeferredGsap();
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c', 'wild'] });
    try {
      await h.spinAndLand([
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ]);

      // Two parallel nudges across reels 1 and 2; both tweens are deferred.
      const nA = h.reelSet.nudge(1, { distance: 1, direction: 'down', incoming: ['wild'] });
      const nB = h.reelSet.nudge(2, { distance: 1, direction: 'down', incoming: ['wild'] });
      expect(deferred.count()).toBe(2);

      // Both in flight → spin() blocked.
      await expect(h.reelSet.spin()).rejects.toThrow(/nudge/);

      // Settle the FIRST nudge only.
      deferred.fire(0);
      await nA;

      // The old single-boolean cleared the guard here; the counter must not.
      await expect(h.reelSet.spin()).rejects.toThrow(/nudge/);

      // Settle the second nudge.
      deferred.fire(1);
      await nB;

      // Guard released — a spin runs again.
      const result = await h.spinAndLand([
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ]);
      expect(result.symbols).toHaveLength(3);
    } finally {
      h.destroy();
    }
  });
});
