/**
 * Partial slam, swept across the whole phase chain.
 *
 * The hang the audit found was not special: it came from landing reels at a
 * moment the rest of the chain implicitly depended on. That is a CLASS of bug,
 * not one bug, so this sweeps a partial slam across every phase a reel can be
 * in - start, spin, anticipation, stop, the three cascade phases, a refill -
 * and across the awkward combinations (held reels, MultiWays, back-to-back
 * slams, pre-result).
 *
 * Every case asserts the same two invariants, which is what makes the sweep
 * worth more than its individual cases:
 *
 *   1. the round SETTLES (a hang shows up as a timeout, not a stuck suite),
 *   2. every non-held reel lands EXACTLY once.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const STAGGERED: SpeedProfile = {
  name: 'staggered',
  spinDelay: 120,
  spinSpeed: 30,
  stopDelay: 80,
  anticipationDelay: 300,
  bounceDistance: 20,
  bounceDuration: 60,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 60,
  minimumSpinTime: 0,
};

const grid = (n: number): ColumnTarget[] =>
  Array.from({ length: n }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness(opts: { tumble?: boolean; multiways?: boolean } = {}) {
  const h = createTestReelSet({
    reels: 5,
    symbolIds: ['a', 'b', 'c'],
    ...(opts.multiways
      ? { multiways: { minCells: 2, maxCells: 4, reelExtent: 320 } }
      : { visibleCells: 3 }),
    ...(opts.tumble ? { tumble: {} } : {}),
  });
  h.reelSet.speed.addProfile(STAGGERED.name, STAGGERED);
  h.reelSet.setSpeed(STAGGERED.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landed: number[] = [];
  h.reelSet.events.on('spin:reelLanded', (i) => landed.push(i)); // NOT deduped: double-land shows up
  return { ...h, landed, stopPump: () => clearInterval(pump) };
}

function within<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

/** Both invariants, in one place. */
function expectSettled(result: unknown, landed: number[], expected: number[]) {
  expect(result, 'round did not settle').not.toBe('timeout');
  expect([...landed].sort((a, b) => a - b), 'landed set').toEqual(expected);
  expect(new Set(landed).size, 'a reel landed more than once').toBe(landed.length);
}

describe('partial slam sweep', () => {
  let active: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    if (active) {
      active.stopPump();
      active.destroy();
      active = null;
    }
  });

  // delayMs picks which phase the targets are sitting in when the slam lands.
  const moments: Array<[string, number]> = [
    ['during START', 30],
    ['as reels reach SPIN', 200],
    ['well into SPIN', 500],
  ];

  for (const [label, delay] of moments) {
    it(`standard: slamming the leading reels ${label} still settles`, async () => {
      const h = (active = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setResult(grid(5));
      await new Promise((r) => setTimeout(r, delay));
      h.reelSet.slamStop({ reels: [0, 1] });
      expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
    });

    it(`standard: slamming the trailing reels ${label} still settles`, async () => {
      // The audit's hang: the trailing reels are the ones that had not reached
      // SPIN yet, so landing them removes the last gate-opener.
      const h = (active = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setResult(grid(5));
      await new Promise((r) => setTimeout(r, delay));
      h.reelSet.slamStop({ reels: [1, 2, 3, 4] });
      expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
    });
  }

  it('standard: slamming mid-ANTICIPATION still settles', async () => {
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4]);
    h.reelSet.setResult(grid(5));
    await new Promise((r) => setTimeout(r, 700)); // inside the tease
    h.reelSet.slamStop({ reels: [3] });
    expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
  });

  it('standard: slamming mid-STOP still settles', async () => {
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(grid(5));
    await new Promise((r) => setTimeout(r, 620)); // early reels are stopping
    h.reelSet.slamStop({ reels: [0, 4] });
    expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
  });

  it('standard: back-to-back partial slams still settle', async () => {
    const h = (active = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(grid(5));
    await new Promise((r) => setTimeout(r, 40));
    h.reelSet.slamStop({ reels: [4] });
    h.reelSet.slamStop({ reels: [3] });
    h.reelSet.slamStop({ reels: [3, 4] }); // already down: must be a no-op
    await new Promise((r) => setTimeout(r, 60));
    h.reelSet.slamStop({ reels: [2] });
    expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
  });

  it('held reels: a partial slam over a held reel still settles', async () => {
    const h = (active = makeHarness());
    const p = h.reelSet.spin({ holdReels: [2] });
    h.reelSet.setResult(grid(5));
    await new Promise((r) => setTimeout(r, 200));
    // Names the held reel on purpose: it must be ignored, not landed.
    h.reelSet.slamStop({ reels: [1, 2, 3, 4] });
    expectSettled(await within(p, 5000), h.landed, [0, 1, 3, 4]);
  });

  it('MultiWays: a partial slam across a reshape still settles', async () => {
    const h = (active = makeHarness({ multiways: true }));
    h.reelSet.setShape([3, 3, 3, 3, 3]);
    const p = h.reelSet.spin();
    h.reelSet.setShape([2, 4, 3, 4, 2]);
    h.reelSet.setResult([
      { visible: ['a', 'b'] }, { visible: ['a', 'b', 'c', 'a'] }, { visible: ['a', 'b', 'c'] },
      { visible: ['a', 'b', 'c', 'a'] }, { visible: ['a', 'b'] },
    ]);
    await new Promise((r) => setTimeout(r, 200));
    h.reelSet.slamStop({ reels: [3, 4] });
    expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
    // The survivors must still have taken the new shape.
    expect(h.reelSet.getVisibleGrid().map((c) => c.length)).toEqual([2, 4, 3, 4, 2]);
  });

  it('spin:allStarted still fires when the slam lands the last starter', async () => {
    // `spin:allStarted` is only ever emitted by a reel ENTERING spin and
    // finding every other reel already there. Land the last reel still waiting
    // to start and nobody is left to emit it, so a listener awaiting the event
    // waits for ever - the same shape of bug as the stop-sequence hang, on the
    // event contract instead of the promise.
    // A WIDE start stagger, so the window is unambiguous under a loaded
    // runner: reel 0 is in SPIN from ~60ms, reel 1 not until ~460ms.
    const h = (active = makeHarness());
    h.reelSet.speed.addProfile('wide', { ...STAGGERED, name: 'wide', spinDelay: 400 });
    h.reelSet.setSpeed('wide');
    let allStarted = false;
    h.reelSet.events.on('spin:allStarted', () => { allStarted = true; });

    const p = h.reelSet.spin();
    h.reelSet.setResult(grid(5));
    // Reel 0 is in SPIN and has already run (and failed) its check; reels 1-4
    // have not entered yet. Landing them leaves nobody to emit.
    await new Promise((r) => setTimeout(r, 200));
    h.reelSet.slamStop({ reels: [1, 2, 3, 4] });

    expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
    expect(allStarted, 'spin:allStarted never fired').toBe(true);
  });

  it('spin:allStarted fires at most once per spin', async () => {
    const h = (active = makeHarness());
    let count = 0;
    h.reelSet.events.on('spin:allStarted', () => { count += 1; });

    const p = h.reelSet.spin();
    h.reelSet.setResult(grid(5));
    await new Promise((r) => setTimeout(r, 400)); // everyone is in SPIN by now
    h.reelSet.slamStop({ reels: [0, 1] });
    await within(p, 5000);

    expect(count).toBe(1);
  });

  it('cascade: a partial slam on the initial tumble spin still settles', async () => {
    const h = (active = makeHarness({ tumble: true }));
    const p = h.reelSet.spin();
    h.reelSet.setResult(grid(5));
    await new Promise((r) => setTimeout(r, 150));
    h.reelSet.slamStop({ reels: [2, 3, 4] });
    expectSettled(await within(p, 5000), h.landed, [0, 1, 2, 3, 4]);
  });

  it('cascade: a partial slam inside a refill still settles', async () => {
    const h = (active = makeHarness({ tumble: true }));
    const first = h.reelSet.spin();
    h.reelSet.setResult(grid(5));
    await within(first, 5000);
    h.landed.length = 0;

    const refill = h.reelSet.refill({
      grid: grid(5),
      winners: [{ reel: 0, cell: 0 }, { reel: 3, cell: 0 }],
    });
    await new Promise((r) => setTimeout(r, 60));
    h.reelSet.slamStop({ reels: [3, 4] });
    expectSettled(await within(refill, 5000), h.landed, [0, 1, 2, 3, 4]);
  });
});
