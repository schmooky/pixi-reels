/**
 * Reel groups: stopping and skipping as blocks.
 *
 * The board this was built for: reels 1-2 spin normally and land together,
 * reels 3-4 tease with a stepwise-protected stagger, and reel 5 keeps spinning
 * at full speed until both teases are over. Index order alone cannot express
 * that - reel 5 is index 4, so the flat `i * stopDelay` stagger landed it in
 * the middle of the tease on the reels before it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 20,
  anticipationDelay: 200,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness() {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  return { ...h, stopPump: () => clearInterval(pump) };
}

/** Reel indices in the order they landed. */
function landOrder(h: ReturnType<typeof makeHarness>): number[] {
  const order: number[] = [];
  h.reelSet.events.on('spin:reelLanded', (i) => order.push(i));
  return order;
}

describe('setReelGroups validation', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('rejects a reel named twice', () => {
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setReelGroups([[0, 1], [1, 2, 3, 4]])).toThrow(
      /reel 1 appears in group 0 and group 1/,
    );
  });

  it('rejects an unlisted reel rather than inventing a trailing group', () => {
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setReelGroups([[0, 1], [2, 3]])).toThrow(/reel 4 not in any group/);
  });

  it('rejects an out-of-range index and an empty group', () => {
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setReelGroups([[0, 1, 2, 3, 9]])).toThrow(/not a reel index/);
    expect(() => h.reelSet.setReelGroups([[], [0, 1, 2, 3, 4]])).toThrow(/group 0 is empty/);
  });

  it('round-trips and clears', () => {
    const h = (harness = makeHarness());
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);
    expect(h.reelSet.reelGroups).toEqual([[0, 1], [2, 3], [4]]);
    h.reelSet.setReelGroups(null);
    expect(h.reelSet.reelGroups).toBeNull();
  });
});

describe('a group holds its reels until the group before it lands', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('keeps the filler reel spinning past a tease on the reels before it', async () => {
    const h = (harness = makeHarness());
    const order = landOrder(h);
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3], { stagger: 120, duration: 200 });
    await p;

    // Reel 4 is LAST, not third: without the barrier its flat stop delay put it
    // down while reels 2 and 3 were still teasing.
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('holds the filler reel at full speed while it waits, rather than pausing it', async () => {
    const h = (harness = makeHarness());
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);
    const filler = h.reelSet.reels[4];
    let sawStopped = false;
    let teasingWhenSampled = false;

    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => {
      if (reelIndex !== 3) return;
      teasingWhenSampled = true;
      // Mid-tease on the group before it, the filler must still be at speed.
      sawStopped = filler.speed < FAST.spinSpeed * 0.9;
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3], { stagger: 100, duration: 200 });
    await p;

    expect(teasingWhenSampled).toBe(true);
    expect(sawStopped).toBe(false);
  });

  it('does nothing when no groups are set', async () => {
    const h = (harness = makeHarness());
    const order = landOrder(h);
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3], { stagger: 120, duration: 200 });
    await p;
    // The flat stagger lands the filler reel in the middle of the tease. That
    // is the behaviour groups exist to change, and it is unchanged without them.
    expect(order.indexOf(4)).toBeLessThan(order.indexOf(3));
  });

  it('ignores a held reel instead of waiting for a landing that never comes', async () => {
    const h = (harness = makeHarness());
    const order = landOrder(h);
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);

    const p = h.reelSet.spin({ holdReels: [0, 1] });
    h.reelSet.setResult(GRID);
    await p;

    expect(order).toEqual([2, 3, 4]);
  });
});

describe('a skip press releases one group at a time', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('walks [0,1] then the teasing reels one by one then [4]', async () => {
    const h = (harness = makeHarness());
    const order = landOrder(h);
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([2, 3], { stagger: 400, duration: 4000, protect: 'stepwise' });

    // Press 1: the pair that has no tease on it, together.
    h.reelSet.skipSpin();
    expect(order).toEqual([0, 1]);

    // Press 2 and 3: one teasing reel each, in tease order - the filler reel
    // behind them is NOT dragged down with the group in front of it.
    h.reelSet.skipSpin();
    expect(order).toEqual([0, 1, 2]);
    h.reelSet.skipSpin();
    expect(order).toEqual([0, 1, 2, 3]);

    // Press 4: the filler group, and only now is the round over.
    h.reelSet.skipSpin();
    await p;
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('releases group by group with no tease at all', async () => {
    const h = (harness = makeHarness());
    const order = landOrder(h);
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.skipSpin();
    expect(order).toEqual([0, 1]);
    h.reelSet.skipSpin();
    expect(order).toEqual([0, 1, 2, 3]);
    h.reelSet.skipSpin();
    await p;
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('still slams the whole board in one press without groups', async () => {
    const h = (harness = makeHarness());
    const order = landOrder(h);
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.skipSpin();
    await p;
    expect(order.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});
