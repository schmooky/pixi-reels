/**
 * Teardown / disposal invariants.
 *   H1 — Reel emits 'destroyed' to attached listeners (was emitted after
 *        removeAllListeners(), so it reached nobody).
 *   H2 — destroy() destroys symbol views instead of releasing live symbols to
 *        the shared pool and then destroying their views out from under it.
 *   H4 — no leaked ticker callbacks after destroy; double-destroy is idempotent.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c'];
const GRID = [
  ['a', 'b', 'c'],
  ['b', 'c', 'a'],
  ['c', 'a', 'b'],
];

describe('ReelSet teardown invariants', () => {
  it('fires each reel\'s "destroyed" event to attached listeners (H1)', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    const fired: number[] = [];
    h.reelSet.reels.forEach((reel, i) => {
      reel.events.on('destroyed', () => fired.push(i));
    });
    h.reelSet.destroy();
    expect(fired.sort()).toEqual([0, 1, 2]);
    h.ticker.destroy();
  });

  it('destroys symbol views instead of leaving them pooled-but-alive (H2)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    await h.spinAndLand(GRID);
    // Capture every live symbol view before teardown clears reel.symbols.
    const views = h.reelSet.reels.flatMap((r) => r.symbols.map((s) => s.view));
    expect(views.length).toBeGreaterThan(0);

    h.reelSet.destroy();
    for (const view of views) {
      expect(view.destroyed).toBe(true);
    }
    h.ticker.destroy();
  });

  it('leaves no ticker callbacks after destroy (H4)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    await h.spinAndLand(GRID);
    expect(h.ticker.listenerCount).toBeGreaterThan(0);

    h.reelSet.destroy();
    expect(h.ticker.listenerCount).toBe(0);
    h.ticker.destroy();
  });

  it('is idempotent under double-destroy (H4)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    await h.spinAndLand(GRID);
    h.reelSet.destroy();
    expect(() => h.reelSet.destroy()).not.toThrow();
    h.ticker.destroy();
  });
});
