/**
 * Issue #181 — sequential / staggered anticipation.
 *
 * Before this change every anticipation reel began its slow-down at the same
 * instant (only the final landing was staggered, by the tiny `stopDelay`), so
 * the teases overlapped almost entirely. These tests pin the START of each
 * reel's tease.
 *
 * Mechanism notes that make these assertions robust:
 *   - `spin:stopping` fires the moment a reel BEGINS slowing (after its
 *     stagger offset), so it is the timestamp of the tease start.
 *   - With `stagger: 0` the first-and-every anticipation reel takes the
 *     synchronous path (no `setTimeout`), so all their `spin:stopping` events
 *     fire in the same microtask — sub-millisecond apart.
 *   - With a numeric stagger the reel at tease-order `k>0` waits
 *     `k * stagger` ms via a real `setTimeout`, producing measurable gaps.
 *   - GSAP self-ticks in node, so the anticipation + stop phases complete on
 *     their own and the spin promise resolves without a manual driver. We
 *     still pump the FakeTicker so reel motion / `_onTick` run realistically.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

// Fast profile so a full anticipation spin completes in well under a second.
// spinDelay 0 = all reels start together; minimumSpinTime 0 = SpinPhase can
// resolve as soon as setResult arrives.
const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 40,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

// Same but with a real per-reel stop stagger, for the setStopDelays(null) test.
const FAST_STAGGERED_STOP: SpeedProfile = { ...FAST, name: 'fastStop', stopDelay: 30 };

// Longer anticipation hold so we can sample reel speed mid-tease deterministically.
const SLOW_ANTIC: SpeedProfile = { ...FAST, name: 'slowAntic', anticipationDelay: 220 };

// Turbo-like: profile has NO anticipation window. tease only plays via a
// per-call `duration` override.
const TURBO0: SpeedProfile = { ...FAST, name: 'turbo0', anticipationDelay: 0 };

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({
  visible: ['a', 'b', 'c'],
}));

function makeHarness(profile: SpeedProfile) {
  const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
  h.reelSet.speed.addProfile(profile.name, profile);
  h.reelSet.setSpeed(profile.name);
  // Pump the reel-set ticker in real time so reel.update / _onTick run.
  const pump = setInterval(() => h.ticker.tick(16), 16);
  return {
    ...h,
    stopPump() {
      clearInterval(pump);
    },
  };
}

describe('anticipation stagger (issue #181)', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;

  beforeEach(() => {
    harness = null;
  });

  afterEach(() => {
    if (harness) {
      harness.stopPump();
      harness.destroy();
      harness = null;
    }
  });

  it('numeric stagger starts each tease in order with measurable gaps', async () => {
    const h = (harness = makeHarness(FAST));
    const teaseAt = new Map<number, number>();
    h.reelSet.events.on('spin:stopping', (i) => {
      if (!teaseAt.has(i)) teaseAt.set(i, performance.now());
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4], 60);
    await p;

    const t2 = teaseAt.get(2)!;
    const t3 = teaseAt.get(3)!;
    const t4 = teaseAt.get(4)!;
    expect(t2).toBeDefined();
    expect(t3).toBeDefined();
    expect(t4).toBeDefined();
    // Strict tease order across the anticipation set.
    expect(t2).toBeLessThan(t3);
    expect(t3).toBeLessThan(t4);
    // Each subsequent tease starts meaningfully later (stagger = 60ms; assert a
    // conservative floor to stay robust under CI timer jitter).
    expect(t3 - t2).toBeGreaterThan(30);
    expect(t4 - t3).toBeGreaterThan(30);
  });

  it('stagger 0 (default) starts all teases together', async () => {
    const h = (harness = makeHarness(FAST));
    const teaseAt = new Map<number, number>();
    h.reelSet.events.on('spin:stopping', (i) => {
      if (!teaseAt.has(i)) teaseAt.set(i, performance.now());
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4]); // stagger defaults to 0
    await p;

    const stamps = [2, 3, 4].map((i) => teaseAt.get(i)!);
    const spread = Math.max(...stamps) - Math.min(...stamps);
    // No setTimeout on the stagger-0 path → all fire in the same microtask.
    expect(spread).toBeLessThan(10);
  });

  it("'sequential' holds each tease until the previous reel has landed", async () => {
    const h = (harness = makeHarness(FAST));
    const log = captureEvents(h.reelSet, ['spin:stopping', 'spin:reelLanded']);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4], 'sequential');
    await p;

    // Index in the ordered event log of "reel i started teasing" and
    // "reel i landed".
    const teaseIdx = (i: number) =>
      log.findIndex((e) => e.event === 'spin:stopping' && e.args[0] === i);
    const landedIdx = (i: number) =>
      log.findIndex((e) => e.event === 'spin:reelLanded' && e.args[0] === i);

    // The core sequential guarantee: reel 3 does not begin its tease until
    // reel 2 has landed; reel 4 not until reel 3 has landed.
    expect(teaseIdx(3)).toBeGreaterThan(landedIdx(2));
    expect(teaseIdx(4)).toBeGreaterThan(landedIdx(3));
  });

  it('stagger resets to 0 on the next spin (no carryover)', async () => {
    const h = (harness = makeHarness(FAST));

    // Spin 1: sequential.
    let p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4], 'sequential');
    await p;

    // Spin 2: anticipation set again but WITHOUT a stagger arg → must be parallel.
    const teaseAt = new Map<number, number>();
    h.reelSet.events.on('spin:stopping', (i) => {
      if (!teaseAt.has(i)) teaseAt.set(i, performance.now());
    });
    p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4]);
    await p;

    const stamps = [2, 3, 4].map((i) => teaseAt.get(i)!);
    expect(Math.max(...stamps) - Math.min(...stamps)).toBeLessThan(10);
  });

  it('slowdown makes each successive reel decelerate to a lower speed', async () => {
    const h = (harness = makeHarness(SLOW_ANTIC));

    // Sample each tease reel's speed mid-hold: 120ms after it starts slowing
    // (deceleration finishes at ~35% of the 220ms hold = ~77ms, so by 120ms
    // the reel sits at its target anticipation speed).
    const holdSpeed = new Map<number, number>();
    h.reelSet.events.on('spin:stopping', (i) => {
      if (![2, 3, 4].includes(i)) return;
      setTimeout(() => {
        holdSpeed.set(i, h.reelSet.reels[i].speed);
      }, 120);
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Parallel start so all three tease at once; from 0.6 -> 0.1 across [2,3,4].
    h.reelSet.setAnticipation([2, 3, 4], { stagger: 0, slowdown: { from: 0.6, to: 0.1 } });
    await p;

    const s2 = holdSpeed.get(2)!;
    const s3 = holdSpeed.get(3)!;
    const s4 = holdSpeed.get(4)!;
    expect(s2).toBeGreaterThan(0);
    // Progressive slow-down: reel 2 fastest, reel 4 slowest.
    expect(s2).toBeGreaterThan(s3);
    expect(s3).toBeGreaterThan(s4);
    // reel 2 ~ 0.6*spinSpeed(30)=18, reel 4 ~ 0.1*30=3 → a clear spread.
    expect(s2 - s4).toBeGreaterThan(6);
  });

  it('does not re-accelerate to full speed on the stop after a tease', async () => {
    // Regression: previously StopPhase reset speed to full spinSpeed for its
    // spin-out, so a teased reel slowed down and then did a fast re-spin into
    // place. It must instead carry the slow anticipation speed into the stop.
    const h = (harness = makeHarness(SLOW_ANTIC)); // spinSpeed 30, anticipationDelay 220
    const reel = h.reelSet.reels[3];

    // Only start watching once the tease has begun (spin:stopping), so the
    // start-up ramp (0→30, which also passes through the slow band) doesn't
    // count.
    let teasing = false;
    h.reelSet.events.on('spin:stopping', (i) => {
      if (i === 3) teasing = true;
    });

    let slowed = false;
    let maxAfterSlow = 0;
    const sampler = setInterval(() => {
      const s = reel.speed;
      // Once the reel has decelerated into the tease hold...
      if (teasing && s > 0 && s < 12) slowed = true;
      // ...it must never speed back up toward full spin speed.
      if (slowed && s > maxAfterSlow) maxAfterSlow = s;
    }, 6);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([3]); // default slowdown → ~0.3*30 = 9 px/frame
    await p;
    clearInterval(sampler);

    expect(slowed).toBe(true);
    // Slow crawl (~9) into landing, never a jump back to ~30. Generous ceiling
    // to stay robust while still catching a reset to full speed.
    expect(maxAfterSlow).toBeLessThan(18);
  });

  it('emits anticipation:reel (with order/total) and anticipation:reelEnd per tease reel', async () => {
    const h = (harness = makeHarness(FAST));
    const starts: Array<{ reelIndex: number; order: number; total: number }> = [];
    const ends: number[] = [];
    h.reelSet.events.on('anticipation:reel', (info) => starts.push(info));
    h.reelSet.events.on('anticipation:reelEnd', (info) => ends.push(info.reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4], 60);
    await p;

    // One start per tease reel, in tease order, with correct order/total.
    expect(starts).toEqual([
      { reelIndex: 2, order: 0, total: 3 },
      { reelIndex: 3, order: 1, total: 3 },
      { reelIndex: 4, order: 2, total: 3 },
    ]);
    // One end per tease reel (order of landing may vary, so compare as a set).
    expect([...ends].sort()).toEqual([2, 3, 4]);
    // Non-tease reels never fire the anticipation events.
    expect(starts.some((s) => s.reelIndex === 0 || s.reelIndex === 1)).toBe(false);
  });

  it('does not fire anticipation events for reels that never tease', async () => {
    const h = (harness = makeHarness(FAST));
    const starts: number[] = [];
    h.reelSet.events.on('anticipation:reel', (i) => starts.push(i.reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // No setAnticipation call → no teases at all.
    await p;

    expect(starts).toEqual([]);
  });

  it('duration override makes the tease play when the profile has anticipationDelay 0 (turbo)', async () => {
    const h = (harness = makeHarness(TURBO0));
    const starts: number[] = [];
    h.reelSet.events.on('anticipation:reel', (i) => starts.push(i.reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Without a duration override this would skip anticipation entirely.
    h.reelSet.setAnticipation([2, 3, 4], { duration: 80, stagger: 40 });
    await p;

    expect([...starts].sort()).toEqual([2, 3, 4]);
  });

  it('turbo profile with NO duration override skips anticipation', async () => {
    const h = (harness = makeHarness(TURBO0));
    const starts: number[] = [];
    h.reelSet.events.on('anticipation:reel', (i) => starts.push(i.reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3, 4], 40); // stagger only, no duration
    await p;

    expect(starts).toEqual([]); // anticipationDelay 0 + no override → no tease
  });

  it('setStopDelays(null) restores the default i*stopDelay stagger', async () => {
    const h = (harness = makeHarness(FAST_STAGGERED_STOP));

    // Measure the reel0→reel4 landing gap for one round. A fresh per-round map
    // records the first landing timestamp of each reel.
    const measureRound = async (): Promise<number> => {
      const landAt = new Map<number, number>();
      const onLanded = (i: number): void => {
        if (!landAt.has(i)) landAt.set(i, performance.now());
      };
      h.reelSet.events.on('spin:reelLanded', onLanded);
      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      await p;
      h.reelSet.events.off('spin:reelLanded', onLanded);
      return landAt.get(4)! - landAt.get(0)!;
    };

    // Round 1: custom override lands reel 4 ~300ms after reel 0.
    h.reelSet.setStopDelays([0, 0, 0, 0, 300]);
    const overrideGap = await measureRound();
    expect(overrideGap).toBeGreaterThan(200);

    // Round 2: clear the override → reverts to default i*30 = 120ms for reel 4,
    // much tighter than the 300ms override (proves it did not stay sticky and
    // did not zero-out either).
    h.reelSet.setStopDelays(null);
    const defaultGap = await measureRound();
    expect(defaultGap).toBeLessThan(overrideGap - 100);
  });
});
