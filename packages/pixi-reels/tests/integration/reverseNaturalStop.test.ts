/**
 * Reverse reels landing through the NATURAL stop, not slamStop().
 *
 * Every other reverse-direction test lands via `spinAndLand`, which calls
 * `slamStop()` -- it bypasses StopPhase entirely and places the frame
 * directly. That leaves the path a real game actually takes untested on a
 * reversed reel: StopSequencer feeding from the opposite edge while the
 * GSAP bounce overshoots toward the smaller main coordinate.
 *
 * Feasible because GSAP is NOT wired to the FakeTicker here -- it runs on its
 * own wall-clock ticker in Node. So the strip advances on FakeTicker pumps
 * while StopPhase's delay and bounce tweens advance on real time; pumping
 * both together lands the reel for real. The generous per-test timeout is the
 * price, which is why this is one focused file rather than a pattern to copy.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { TestReelSetHandle } from '../../src/testing/testHarness.js';

const IDS = ['a', 'b', 'c', 'd'];
const REELS = 3;
const CELLS = 3;

const GRID = Array.from({ length: REELS }, (_, r) =>
  Array.from({ length: CELLS }, (_, c) => IDS[(r + c) % IDS.length]),
);

/**
 * Drive both clocks until `promise` settles: the FakeTicker moves the strip,
 * real time moves the GSAP tweens StopPhase builds.
 */
async function pumpUntil<T>(h: TestReelSetHandle, promise: Promise<T>, budgetMs = 8000): Promise<T> {
  let settled = false;
  const tracked = promise.finally(() => {
    settled = true;
  });
  const started = Date.now();
  while (!settled && Date.now() - started < budgetMs) {
    h.advance(16);
    await new Promise((r) => setTimeout(r, 4));
  }
  return tracked;
}

describe('reverse reels land through the natural stop', () => {
  const build = (direction: 'forward' | 'reverse') =>
    createTestReelSet({
      reels: REELS,
      visibleCells: CELLS,
      symbolIds: IDS,
      direction,
      symbolSize: { width: 120, height: 100 },
    });

  it('a reverse set lands the requested grid without slamStop', async () => {
    const h = build('reverse');
    try {
      const spin = h.reelSet.spin();
      h.advance(200);
      h.reelSet.setResult(GRID.map((visible) => ({ visible })));
      const result = await pumpUntil(h, spin);
      expect(result.wasSkipped).toBe(false);
      expect(h.reelSet.getVisibleGrid()).toEqual(GRID);
    } finally {
      h.destroy();
    }
  }, 20000);

  it('lands the same grid a forward set does, through the same path', async () => {
    const f = build('forward');
    const r = build('reverse');
    try {
      const fSpin = f.reelSet.spin();
      f.advance(200);
      f.reelSet.setResult(GRID.map((visible) => ({ visible })));
      await pumpUntil(f, fSpin);

      const rSpin = r.reelSet.spin();
      r.advance(200);
      r.reelSet.setResult(GRID.map((visible) => ({ visible })));
      await pumpUntil(r, rSpin);

      expect(r.reelSet.getVisibleGrid()).toEqual(f.reelSet.getVisibleGrid());
      expect(r.reelSet.getVisibleGrid()).toEqual(GRID);
    } finally {
      f.destroy();
      r.destroy();
    }
  }, 20000);

  it('mixed directionPerReel lands the grid through the natural stop', async () => {
    const h = createTestReelSet({
      reels: REELS,
      visibleCells: CELLS,
      symbolIds: IDS,
      directionPerReel: ['forward', 'reverse', 'forward'],
      symbolSize: { width: 120, height: 100 },
    });
    try {
      const spin = h.reelSet.spin();
      h.advance(200);
      h.reelSet.setResult(GRID.map((visible) => ({ visible })));
      await pumpUntil(h, spin);
      expect(h.reelSet.getVisibleGrid()).toEqual(GRID);
    } finally {
      h.destroy();
    }
  }, 20000);
});
