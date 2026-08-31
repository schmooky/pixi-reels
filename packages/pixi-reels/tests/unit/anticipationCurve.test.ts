/**
 * Shaped anticipation: explicit speed curves, the travel anchor, and the
 * drive motion model.
 *
 * The complaint these answer is that the stock tease reads as a setting
 * change rather than as the reel slowing down. Three separate causes:
 * `power2.out` on a speed value is a step in acceleration, the tease is 65%
 * dead hold, and there was no way to ask a reel to speed UP.
 *
 * Timing notes match `anticipationStagger.test.ts`: GSAP self-ticks in node,
 * so phases complete on their own; the FakeTicker is pumped in real time so
 * `reel.update` runs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { Ticker } from 'pixi.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 240,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

/** Turbo-like: no tease window unless a `duration` override asks for one. */
const TURBO0: SpeedProfile = { ...FAST, name: 'turbo0', anticipationDelay: 0 };

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness(profile: SpeedProfile = FAST) {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
  h.reelSet.speed.addProfile(profile.name, profile);
  h.reelSet.setSpeed(profile.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  return { ...h, stopPump: () => clearInterval(pump) };
}

/** Record one reel's speed every few ms from the moment its tease begins. */
function sampleTease(
  h: ReturnType<typeof makeHarness>,
  reelIndex: number,
  everyMs = 8,
): number[] {
  const samples: number[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  h.reelSet.events.on('spin:stopping', (i) => {
    if (i !== reelIndex || timer) return;
    timer = setInterval(() => samples.push(h.reelSet.reels[reelIndex].speed), everyMs);
  });
  h.reelSet.events.on('anticipation:reelEnd', ({ reelIndex: i }) => {
    if (i === reelIndex && timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  return samples;
}

describe('anticipation curve', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('lets a tease speed UP before it slows down', async () => {
    const h = (harness = makeHarness());
    const samples = sampleTease(h, 4);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], {
      curve: [
        { speed: 2, duration: 160, ease: 'power2.in' },
        { speed: 0.1, duration: 300, ease: 'power2.inOut', hold: 120 },
      ],
    });
    await p;

    // The surge overshoots full spin speed, which the legacy shape could not do
    // at all, and the crawl afterwards goes well below it.
    expect(Math.max(...samples)).toBeGreaterThan(FAST.spinSpeed * 1.3);
    expect(Math.min(...samples)).toBeLessThan(FAST.spinSpeed * 0.4);
  });

  it('caps a surge at full spin speed going into the landing', async () => {
    // StopPhase carries the tease speed into the spin-out (`preserveSpeed`). A
    // curve that ended on a surge must not leak an above-normal speed into the
    // frame placement.
    //
    // `anticipation:reelEnd` is a SET-level event fired at landing, far too
    // late to watch the spin-out. The reel's own `phase:enter` is the actual
    // tease-to-stop boundary.
    const h = (harness = makeHarness());
    const afterTease: number[] = [];
    let t: ReturnType<typeof setInterval> | null = null;
    h.reelSet.reels[4].events.on('phase:enter', (name) => {
      if (name !== 'stop' || t) return;
      t = setInterval(() => afterTease.push(h.reelSet.reels[4].speed), 4);
    });
    h.reelSet.events.on('spin:reelLanded', (i) => {
      if (i === 4 && t) {
        clearInterval(t);
        t = null;
      }
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], { curve: [{ speed: 2.5, duration: 120, hold: 60 }] });
    await p;

    expect(afterTease.length).toBeGreaterThan(0);
    expect(Math.max(...afterTease)).toBeLessThanOrEqual(FAST.spinSpeed + 1e-6);
  });

  it('varies the curve per reel through the function form, by tease order', async () => {
    const h = (harness = makeHarness());
    const orders: Array<{ order: number; total: number }> = [];

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Deliberately out of index order: reel 4 is tease-order 0.
    h.reelSet.setAnticipation([4, 2, 3], {
      curve: (order, total) => {
        orders.push({ order, total });
        return [{ speed: 0.5 - 0.1 * order, duration: 60, hold: 30 }];
      },
    });
    await p;

    expect(orders).toHaveLength(3);
    expect(orders.map((o) => o.order).sort()).toEqual([0, 1, 2]);
    expect(orders.every((o) => o.total === 3)).toBe(true);
  });

  it('plays in Turbo when a duration override opens the window', async () => {
    const h = (harness = makeHarness(TURBO0));
    const samples = sampleTease(h, 4);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], {
      duration: 200,
      curve: [{ speed: 0.15, duration: 120, hold: 80 }],
    });
    await p;

    expect(samples.length).toBeGreaterThan(0);
    expect(Math.min(...samples)).toBeLessThan(TURBO0.spinSpeed * 0.5);
  });

  it('stays inert in Turbo without a duration override, like the legacy tease', async () => {
    const h = (harness = makeHarness(TURBO0));
    const teased: number[] = [];
    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teased.push(reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], { curve: [{ speed: 0.15, duration: 120 }] });
    await p;

    expect(teased).toEqual([]);
  });

  it('leaves an un-teased spin completely alone', async () => {
    const h = (harness = makeHarness());
    const teased: number[] = [];
    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teased.push(reelIndex));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p;
    expect(teased).toEqual([]);
  });
});

describe('anticipation curve validation', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('refuses slowdown and curve together instead of silently picking one', () => {
    const h = (harness = makeHarness());
    expect(() =>
      h.reelSet.setAnticipation([4], {
        slowdown: { from: 0.4 },
        curve: [{ speed: 0.2, duration: 100 }],
      }),
    ).toThrow(/either `slowdown` or `curve`/);
  });

  it('refuses an empty curve', () => {
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setAnticipation([4], { curve: [] })).toThrow(/at least one segment/);
  });

  it.each([0, -3])('refuses a non-positive cells count (%s)', (cells) => {
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setAnticipation([4], { cells })).toThrow(/positive number of symbol/);
  });

  it('names the reel when a curve function returns nothing', () => {
    // Thrown at the CALL, not deferred into the reel task: a curve function is
    // resolved for every teasing reel the moment `setAnticipation` is made, so
    // the caller sees the failure next to their own stack instead of watching
    // the spin land anyway.
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setAnticipation([4], { curve: () => [] })).toThrow(
      /returned no segments for reel 4[\s\S]*tease order 0/,
    );
  });
});

describe('anticipation anchored to travel', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('ends the tease once the reel has covered the requested cells', async () => {
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[4];
    let atStart = 0;
    let atEnd = 0;
    // Both readings come off the reel's own phase boundaries. The set-level
    // `anticipation:reelEnd` fires at LANDING, so it would fold the whole
    // spin-out into the measurement.
    reel.events.on('phase:enter', (name) => {
      if (name === 'anticipation') atStart = reel.travelledCells;
      if (name === 'stop' && atEnd === 0) atEnd = reel.travelledCells;
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // A long backstop so the CELLS target is what actually ends it.
    h.reelSet.setAnticipation([4], {
      duration: 4000,
      curve: [{ speed: 0.8, duration: 40 }],
      cells: 2,
    });
    await p;

    expect(atEnd - atStart).toBeGreaterThanOrEqual(2);
    // Ended on travel, not on the 4-second backstop.
    expect(atEnd - atStart).toBeLessThan(6);
  });

  it('still ends on the time backstop when the reel stops moving', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Speed 0 means the travel target is unreachable; the tease must not hang.
    h.reelSet.setAnticipation([4], {
      duration: 120,
      curve: [{ speed: 0, duration: 30 }],
      cells: 99,
    });
    await expect(p).resolves.toBeDefined();
  });
});

describe('reel telemetry for tease audio', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('reports speed as a fraction of the profile spin speed', async () => {
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[4];
    expect(reel.speedNormalized).toBe(0);

    const seen: number[] = [];
    h.reelSet.events.on('spin:stopping', (i) => {
      if (i !== 4) return;
      const t = setInterval(() => seen.push(reel.speedNormalized), 8);
      setTimeout(() => clearInterval(t), 240);
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], { curve: [{ speed: 0.2, duration: 120, hold: 100 }] });
    await p;

    expect(Math.min(...seen)).toBeLessThan(0.5);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('keeps counting travelled cells across the snap at the end of a spin', async () => {
    // A real ticked spin, not `spinAndLand` - that slams for determinism, so
    // the reel never actually travels and the odometer would read 0 either way.
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[0];
    const spinOnce = async (): Promise<void> => {
      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      await p;
    };

    await spinOnce();
    const afterFirst = reel.travelledCells;
    expect(afterFirst).toBeGreaterThan(0);

    await spinOnce();
    // Each landing calls `snapToGrid`, which resets the motion layer's SIGNED
    // travel. The odometer must not reset with it, or a tease could never
    // measure across one.
    expect(reel.travelledCells).toBeGreaterThan(afterFirst);
  });
});

describe("motionModel('drive')", () => {
  function makeDriveHarness(drive: { accel: number; decel?: number; jerk?: number }) {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(120, 100)
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => {
        for (const id of ['a', 'b', 'c']) r.register(id, HeadlessSymbol, {});
      })
      .motionModel('drive', drive)
      .build();
    reelSet.speed.addProfile(FAST.name, FAST);
    reelSet.setSpeed(FAST.name);
    const pump = setInterval(() => ticker.tick(16), 16);
    return { reelSet, ticker, stopPump: () => clearInterval(pump) };
  }

  it('rejects a drive model with no config', () => {
    // @ts-expect-error the config is required by the overload; this is the JS caller
    expect(() => new ReelSetBuilder().motionModel('drive')).toThrow(/config is required/);
  });

  it('validates the bounds at build time, not at the first tick', () => {
    expect(() => new ReelSetBuilder().motionModel('drive', { accel: 0 })).toThrow(
      /accel must be a positive/,
    );
  });

  it("rejects an unknown model name", () => {
    // @ts-expect-error deliberately wrong
    expect(() => new ReelSetBuilder().motionModel('springs')).toThrow(/'tween' or 'drive'/);
  });

  it('leaves reels on the tween model by default', () => {
    const h = makeHarness();
    harnessCleanup = h;
    expect(h.reelSet.reels.every((r) => r.hasDrive)).toBe(false);
  });

  let harnessCleanup: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harnessCleanup?.stopPump();
    harnessCleanup?.destroy();
    harnessCleanup = null;
  });

  it('marks every reel as driven when the model is on', () => {
    const h = makeDriveHarness({ accel: 2 });
    expect(h.reelSet.reels.every((r) => r.hasDrive)).toBe(true);
    h.stopPump();
    h.reelSet.destroy();
  });

  it('completes a full spin and lands the requested grid', async () => {
    const h = makeDriveHarness({ accel: 3, decel: 2, jerk: 0.3 });
    const grid: ColumnTarget[] = [
      { visible: ['a', 'a', 'a'] },
      { visible: ['b', 'b', 'b'] },
      { visible: ['c', 'c', 'c'] },
    ];
    const p = h.reelSet.spin();
    h.reelSet.setResult(grid);
    const result = await p;
    expect(result).toBeDefined();
    expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['b', 'b', 'b']);
    // Landed means stopped, drive included.
    expect(h.reelSet.reels[1].speed).toBe(0);
    expect(h.reelSet.reels[1].targetSpeed).toBe(0);
    h.stopPump();
    h.reelSet.destroy();
  });

  it('never lets the speed jump more than the bounds allow during a spin', async () => {
    const h = makeDriveHarness({ accel: 1.5, decel: 1.5 });
    const reel = h.reelSet.reels[0];
    let last = reel.speed;
    let worst = 0;
    const watch = setInterval(() => {
      const now = reel.speed;
      // Landing halts the drive dead (`haltDrive`) so the reel can snap to grid
      // and bounce. That discontinuity is deliberate and is the same in both
      // motion models, so it is not what this law is about.
      if (now !== 0) worst = Math.max(worst, Math.abs(now - last));
      last = now;
    }, 16);

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID.slice(0, 3));
    await p;
    clearInterval(watch);

    expect(worst).toBeGreaterThan(0);
    // Sampling on a 16ms interval can straddle two engine ticks, so the budget
    // is two frames of the bound rather than one.
    expect(worst).toBeLessThanOrEqual(1.5 * 2.2 + 1e-6);
    h.stopPump();
    h.reelSet.destroy();
  });
});
