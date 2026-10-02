/**
 * Skip inside an expansion: every press the engine knows, against a board
 * that grows a step at a time.
 *
 *   - reel groups: a base round walks its groups press by press, and each
 *     step's reels are one more group,
 *   - a press between steps (a hook is running, nothing spins) carries to
 *     the next step instead of being dropped,
 *   - a protected tease on a step's reel holds through the first press,
 *   - quicken presses, partial slams.
 *
 * The profile spins for a long time unless pressed (`minimumSpinTime`), so a
 * reel that lands early can only have been landed by the press under test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import type { TestReelSetOptions } from '../../src/testing/testHarness.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';
import type { SkipInfo } from '../../src/events/ReelEvents.js';

const SLOW: SpeedProfile = {
  name: 'slow',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 20,
  anticipationDelay: 600,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  // Nothing lands on its own for 2s: anything that lands sooner was pressed.
  minimumSpinTime: 2000,
};
const TURBO: SpeedProfile = { ...SLOW, name: 'turbo', spinSpeed: 60, minimumSpinTime: 0 };

const IDS = ['a', 'b', 'c', 'wild'];
const col = (...visible: string[]): ColumnTarget => ({ visible });
const BASE = Array.from({ length: 5 }, () => col('a', 'b', 'c'));

const harnesses: Array<{ destroy(): void; stopPump(): void }> = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.stopPump();
    h.destroy();
  }
});

function makeHarness(opts: TestReelSetOptions = {}) {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: IDS, ...opts });
  h.reelSet.speed.addProfile(SLOW.name, SLOW);
  h.reelSet.speed.addProfile(TURBO.name, TURBO);
  h.reelSet.setSpeed(SLOW.name);
  const pump = setInterval(() => h.ticker.tick(16), 8);
  const handle = { ...h, stopPump: () => clearInterval(pump) };
  harnesses.push(handle);
  return handle;
}

/** Land the base board at once, without a press the round would remember. */
async function landBase(h: ReturnType<typeof makeHarness>) {
  const spin = h.reelSet.spin();
  h.reelSet.setResult(BASE);
  h.reelSet.slamStop();
  await spin;
}

const skips = (h: ReturnType<typeof makeHarness>) => {
  const log: Array<{ reels: number[]; partial: boolean; mode: string }> = [];
  h.reelSet.events.on('skip:requested', (info: SkipInfo) =>
    log.push({ reels: [...info.reels], partial: info.partial, mode: info.mode }),
  );
  return log;
};

/** Press once, the moment the step's reels are all spinning. */
function pressOnStep(h: ReturnType<typeof makeHarness>, press: () => void, onStep = 0): void {
  let step = -1;
  h.reelSet.events.on('expand:stepAdded', (s) => {
    step = s.index;
  });
  const onStarted = (): void => {
    if (step !== onStep) return;
    h.reelSet.events.off('spin:allStarted', onStarted);
    press();
  };
  h.reelSet.events.on('spin:allStarted', onStarted);
}

describe('skip in an expansion', () => {
  it('reel groups: the base round walks its groups, each step is one more group', async () => {
    const h = makeHarness();
    h.reelSet.setReelGroups([[0, 1, 2], [3, 4]]);
    const log = skips(h);

    const spin = h.reelSet.spin();
    h.reelSet.setResult(BASE);
    h.reelSet.skipSpin();
    expect(h.reelSet.skipStage).toBe(1);
    h.reelSet.skipSpin();
    await spin;
    expect(log).toEqual([
      { reels: [0, 1, 2], partial: true, mode: 'slam' },
      { reels: [3, 4], partial: false, mode: 'slam' },
    ]);

    log.length = 0;
    pressOnStep(h, () => h.reelSet.skipSpin());
    const t0 = Date.now();
    await h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('b', 'b', 'b')], step: 2 });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(h.reelSet.reelGroups).toEqual([[0, 1, 2], [3, 4], [5, 6]]);
    // One press lands the step's group whole.
    expect(log).toEqual([{ reels: [5, 6], partial: false, mode: 'slam' }]);
  });

  it('a step split into groups in onStepAdded lands a group per press', async () => {
    const h = makeHarness();
    await landBase(h);
    const log = skips(h);
    let presses = 0;
    h.reelSet.events.on('spin:allStarted', () => {
      if (h.reelSet.reels.length === 7 && presses === 0) {
        presses++;
        h.reelSet.skipSpin();
        expect(h.reelSet.skipStage).toBe(1);
        h.reelSet.skipSpin();
      }
    });
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a'), col('b', 'b', 'b')],
      step: 2,
      // The step's reels arrive as one group; reveal them one by one instead.
      onStepAdded: () => h.reelSet.setReelGroups([[0, 1, 2, 3, 4], [5], [6]]),
    });
    expect(log.map((e) => e.reels)).toEqual([[5], [6]]);
    expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['a', 'a', 'a'], ['b', 'b', 'b']]);
  });

  it('a press between steps carries to the next step instead of being lost', async () => {
    const h = makeHarness();
    await landBase(h);
    const queued = captureEvents(h.reelSet, ['skip:queued']);
    const stepSkipped: boolean[] = [];
    const t0 = Date.now();
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a'), col('b', 'b', 'b')],
      // Pressed while the camera would be panning: nothing is spinning yet.
      onStepAdded: (step) => {
        if (step.index === 1) h.reelSet.skipSpin();
      },
      onStepLanded: (step) => {
        stepSkipped.push(step.result.wasSkipped);
      },
    });
    // Step 0 ran its course; step 1 was landed by the carried press.
    expect(stepSkipped).toEqual([false, true]);
    expect(queued).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(2000 + 1500);
    expect(h.reelSet.skipStage).toBe(2);
  });

  it('requestSkip() between steps carries too, and never boosts', async () => {
    const h = makeHarness();
    await landBase(h);
    const boosts = captureEvents(h.reelSet, ['skip:boosted']);
    const stepSkipped: boolean[] = [];
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a')],
      onStepAdded: () => h.reelSet.requestSkip(),
      onStepLanded: (step) => {
        stepSkipped.push(step.result.wasSkipped);
      },
    });
    expect(stepSkipped).toEqual([true]);
    expect(boosts).toEqual([]);
  });

  it('a press after the last step does not leak into the next round', async () => {
    const h = makeHarness();
    await landBase(h);
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a')],
      signal: AbortSignal.abort(),
      onStepLanded: () => h.reelSet.skipSpin(),
    });
    const log = skips(h);
    const spin = h.reelSet.spin();
    h.reelSet.setResult([...BASE, col('c', 'c', 'c')]);
    await new Promise((r) => setTimeout(r, 120));
    expect(log).toEqual([]);
    h.reelSet.slamStop();
    await spin;
  });

  it('a protected tease on the step reel survives the first press', async () => {
    const h = makeHarness();
    await landBase(h);
    const landed = captureEvents(h.reelSet, ['spin:reelLanded']);
    let landedAfterFirst: number | null = null;
    h.reelSet.events.on('anticipation:reel', () => {
      h.reelSet.skipSpin();
      // The first press spends the protection; the tease plays on.
      landedAfterFirst = landed.length;
      expect(h.reelSet.skipStage).toBe(1);
      h.reelSet.skipSpin();
    });
    const result = await h.reelSet.expand({
      columns: [col('wild', 'wild', 'wild')],
      anticipation: { protect: 'once' },
    });
    expect(landedAfterFirst).toBe(0);
    expect(landed.map((e) => e.args[0])).toEqual([5]);
    expect(result.wasSkipped).toBe(true);
    expect(h.reelSet.getVisibleGrid()[5]).toEqual(['wild', 'wild', 'wild']);
  });

  it('anticipation options per step: a function picks the step and the shape', async () => {
    const h = makeHarness();
    await landBase(h);
    const teased: number[] = [];
    h.reelSet.events.on('anticipation:reel', (info) => teased.push(info.reelIndex));
    h.reelSet.setSpeed('turbo');
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a'), col('b', 'b', 'b'), col('c', 'c', 'c')],
      // Turbo's anticipationDelay is 600 too here; `duration` is what a game
      // passes to tease under a profile that has none.
      anticipation: (step) => (step.index === 2 ? { duration: 150 } : false),
    });
    expect(teased).toEqual([7]);
  });

  it('a quicken press lands the step through its own stop', async () => {
    const h = makeHarness({ skipMode: 'quicken' });
    await landBase(h);
    const log = skips(h);
    pressOnStep(h, () => h.reelSet.skipSpin());
    const t0 = Date.now();
    const result = await h.reelSet.expand({ columns: [col('wild', 'a', 'b')] });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(log).toEqual([{ reels: [5], partial: false, mode: 'quicken' }]);
    expect(result.wasSkipped).toBe(true);
    expect(h.reelSet.getVisibleGrid()[5]).toEqual(['wild', 'a', 'b']);
  });

  it('a partial slam lands one reel of a two-reel step and lets the other run', async () => {
    const h = makeHarness();
    await landBase(h);
    const log = skips(h);
    const landed = captureEvents(h.reelSet, ['spin:reelLanded']);
    pressOnStep(h, () => h.reelSet.slamStop({ reels: [5] }));
    await h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('b', 'b', 'b')], step: 2 });
    expect(log).toEqual([{ reels: [5], partial: true, mode: 'slam' }]);
    expect(landed.map((e) => e.args[0])).toEqual([5, 6]);
    expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['a', 'a', 'a'], ['b', 'b', 'b']]);
  });
});
