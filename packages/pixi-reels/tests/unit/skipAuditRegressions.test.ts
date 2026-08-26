/**
 * Regressions from the PR audit of the skip-granularity work.
 *
 * Both were silent: one hangs a spin for ever, the other quietly upgrades
 * `protect: true` to the strongest mode. Neither was caught by the existing
 * suite, because every test and recipe happened to use the `'once'` STRING and
 * to slam reels in an order that kept the stop-sequence gate satisfied.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

// A real per-reel start stagger, so reels enter SPIN at different times and a
// slam can land the one whose SPIN entry would have opened the gate.
const STAGGERED: SpeedProfile = {
  name: 'staggered',
  spinDelay: 200,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 150,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness(profile: SpeedProfile = STAGGERED) {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
  h.reelSet.speed.addProfile(profile.name, profile);
  h.reelSet.setSpeed(profile.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landed: number[] = [];
  h.reelSet.events.on('spin:reelLanded', (i) => { if (!landed.includes(i)) landed.push(i); });
  return { ...h, landed, stopPump: () => clearInterval(pump) };
}

/** Resolve to 'timeout' rather than hanging the suite when a spin never settles. */
function within<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

describe('skip audit regressions', () => {
  let active: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    if (active) {
      active.stopPump();
      active.destroy();
      active = null;
    }
  });

  it('a partial slam that lands the gate-opening reel still settles the spin', async () => {
    // `_tryBeginStopSequence` needs every non-held, non-landed reel to be
    // holding a 'spin' phase, and only `setResult()` and a reel ENTERING spin
    // ever trigger it. Slam the reels that had not reached SPIN yet and the
    // survivors' SpinPhase is left with nobody to resolve it: they spin for
    // ever and `spin()` never settles. Only a `timeoutMs` watchdog recovers.
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID); // gate returns early: reels 1-4 not in SPIN yet

    // Reel 0 is up; 1-4 are still inside their staggered StartPhase.
    await new Promise((r) => setTimeout(r, 60));
    h.reelSet.slamStop({ reels: [1, 2, 3, 4] });
    expect([...h.landed].sort()).toEqual([1, 2, 3, 4]);

    const result = await within(p, 4000);
    expect(result).not.toBe('timeout');
    expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('tease protection on low-index reels still settles the spin', async () => {
    // The same hole reached through the engine's own protect path. The tease
    // has to sit on the reel that is ALREADY in SPIN, so that the press slams
    // every reel whose SPIN entry would still have opened the gate. With the
    // tease on reels [0, 1] the hang does not reproduce: reel 1 is still in
    // StartPhase, survives the press, and re-opens the gate itself on entry.
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([0], { protect: 'once' });
    h.reelSet.setResult(GRID);

    await new Promise((r) => setTimeout(r, 60));
    h.reelSet.skipSpin();

    const result = await within(p, 5000);
    expect(result).not.toBe('timeout');
    expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("protect: true is 'once', not 'always'", async () => {
    // The type is `boolean | 'once' | 'stepwise' | 'always'` and every doc says
    // `true` means `'once'`, but the spend check compares against the STRING,
    // so a raw `true` never spent and no press could ever end the tease.
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4], { protect: true });
    h.reelSet.setResult(GRID);

    await new Promise((r) => setTimeout(r, 700)); // let every reel reach SPIN
    h.reelSet.skipSpin();
    expect([...h.landed].sort()).toEqual([0, 1, 2]);

    h.reelSet.skipSpin(); // second press must END the tease
    expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(h.reelSet.skipStage).toBe(2);
    await within(p, 3000);
  });

  it('a slamStop that covers every reel ends the round AND the stage', async () => {
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await new Promise((r) => setTimeout(r, 700));

    h.reelSet.slamStop({ reels: [0, 1, 2, 3, 4] });
    expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
    // Covering every reel is not a partial slam: it ended the round, so a
    // skipStage-driven button must not still read "skippable".
    expect(h.reelSet.skipStage).toBe(2);
    await within(p, 3000);
  });
});
