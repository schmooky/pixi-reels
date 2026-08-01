/**
 * MultiWays reshape ordering in CASCADE (classic-tumble) mode.
 *
 * `CascadeFallPhase` drops a reel's CURRENT visible cells. In standard mode the
 * reshape runs between SPIN and STOP (spin blur hides it), but cascade mode has
 * no such cover: if the reshape ran after the fall, a reel that changed height
 * would drop its OLD, differently-sized board and then snap to the new shape.
 *
 * Fix: when the target shape is known at spin time (`setShape()` called BEFORE
 * `spin({ mode: 'cascade' })`), the reshape commits BEFORE the fall, so the fall
 * drops the reel at its target height. This test asserts the reel is already at
 * its target `visibleCells` by `cascade:fall:start`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { driveGsapWithTicker } from '../../src/utils/gsapTicker.js';
import { DEFAULT_GSAP } from '../../src/utils/gsap.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';
import type { Ticker } from 'pixi.js';

let stopGsap: (() => void) | null = null;
let ticker: FakeTicker;

beforeEach(() => {
  ticker = new FakeTicker();
  stopGsap = driveGsapWithTicker(ticker as unknown as Ticker);
});
afterEach(() => {
  // These tests bail mid-fall and destroy the reel set, leaving in-flight phase
  // timelines that reference now-destroyed views. Kill them BEFORE restoring
  // gsap's own ticker, or a lazy tween init reads a null view's `.y`.
  DEFAULT_GSAP.globalTimeline.clear();
  stopGsap?.();
  stopGsap = null;
  ticker.destroy();
});

function build() {
  return new ReelSetBuilder()
    .reels(5)
    .multiways({ minCells: 2, maxCells: 5, reelExtent: 500 })
    .symbolSize(100, 100)
    .symbols((r) => { for (const id of ['a', 'b', 'c']) r.register(id, HeadlessSymbol, {}); })
    .weights({ a: 1, b: 1, c: 1 })
    .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 0, accelerationDuration: 0 })
    .tumble({
      fall: { duration: 200, ease: 'power2.in', cellStagger: 0 },
      dropIn: { duration: 200, ease: 'power2.in', cellStagger: 0, distance: 'auto' },
    })
    .ticker(ticker as unknown as Ticker)
    .build();
}

describe('cascade reshape-before-fall (setShape before spin)', () => {
  it('each reel is already at its target visibleCells by cascade:fall:start', async () => {
    const reelSet = build();
    try {
      // MultiWays builds at maxCells (5). Commit a NEW, smaller jagged shape
      // BEFORE the cascade spin so the reshape is known at spin time.
      const target = [2, 3, 4, 3, 2];
      expect(reelSet.reels.map((r) => r.visibleCells)).toEqual([5, 5, 5, 5, 5]);

      const rowsAtFallStart: Record<number, number> = {};
      reelSet.events.on('cascade:fall:start', (info: any) => {
        rowsAtFallStart[info.reelIndex] = reelSet.reels[info.reelIndex].visibleCells;
      });

      reelSet.setShape(target);              // BEFORE spin - the fix's precondition
      reelSet.spin({ mode: 'cascade' }).catch(() => {});
      reelSet.setResult(target.map((cells) => ({ visible: Array.from({ length: cells }, () => 'a') })));

      // Tick just far enough for every reel's fall to start.
      for (let f = 0; f < 20 && Object.keys(rowsAtFallStart).length < 5; f++) {
        ticker.tick(16);
        await new Promise((r) => setTimeout(r, 0));
      }

      // The reshape committed before the fall: every reel fell at its target
      // height, not the old maxCells shape.
      expect(rowsAtFallStart).toEqual({ 0: 2, 1: 3, 2: 4, 3: 3, 4: 2 });
    } finally {
      reelSet.destroy();
    }
  });

  it('legacy order (spin then setShape) still reshapes after the fall', async () => {
    const reelSet = build();
    try {
      const target = [2, 3, 4, 3, 2];
      const rowsAtFallStart: Record<number, number> = {};
      reelSet.events.on('cascade:fall:start', (info: any) => {
        rowsAtFallStart[info.reelIndex] = reelSet.reels[info.reelIndex].visibleCells;
      });

      // Shape arrives AFTER the spin - the fall runs on the old (maxCells) shape.
      reelSet.spin({ mode: 'cascade' }).catch(() => {});
      reelSet.setShape(target);
      reelSet.setResult(target.map((cells) => ({ visible: Array.from({ length: cells }, () => 'a') })));

      for (let f = 0; f < 20 && Object.keys(rowsAtFallStart).length < 5; f++) {
        ticker.tick(16);
        await new Promise((r) => setTimeout(r, 0));
      }

      // Unchanged legacy behavior: fall happened at the old shape.
      expect(rowsAtFallStart).toEqual({ 0: 5, 1: 5, 2: 5, 3: 5, 4: 5 });
    } finally {
      reelSet.destroy();
    }
  });
});
