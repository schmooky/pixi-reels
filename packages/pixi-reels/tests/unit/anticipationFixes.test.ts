/**
 * Regressions for the shaped-anticipation review.
 *
 * Every case here was silent before: a curve that scrolled a cascade reel it
 * must not touch, a travel anchor that deleted the legs after the first one,
 * nonsense segments accepted and played, and a drive whose bounds were pinned
 * to whichever speed profile happened to be active at build time.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { resetNoticesForTest, setLogLevel } from '../../src/utils/notify.js';
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

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness() {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  return { ...h, stopPump: () => clearInterval(pump) };
}

describe('a travel anchor does not eat the legs before the last one', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('plays the whole curve, then measures travel on the final leg', async () => {
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[4];
    const speeds: number[] = [];
    let ended = 0;
    reel.events.on('phase:enter', (name: string) => {
      if (name === 'stop' && ended === 0) ended = Date.now();
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // A surge covers cells FAST. Measuring from the start of the tease, two
    // pitches go by inside the surge and the crawl never plays at all.
    h.reelSet.setAnticipation([4], {
      duration: 3000,
      curve: [
        { speed: 1.5, duration: 260 },
        { speed: 0.1, duration: 220, hold: 60 },
      ],
      cells: 2,
    });
    const sampler = setInterval(() => speeds.push(reel.speed), 8);
    await p;
    clearInterval(sampler);

    // The surge happened...
    expect(Math.max(...speeds)).toBeGreaterThan(FAST.spinSpeed);
    // ...and so did the crawl the surge would otherwise have deleted.
    const crawl = FAST.spinSpeed * 0.2;
    expect(speeds.some((s) => s > 0 && s < crawl)).toBe(true);
  });
});

describe('a curve never scrolls a cascade reel', () => {
  function buildTumble() {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(100, 100)
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .tumble()
      .build();
    reelSet.speed.addProfile(FAST.name, FAST);
    reelSet.setSpeed(FAST.name);
    const pump = setInterval(() => ticker.tick(16), 16);
    return {
      reelSet,
      stop: () => {
        clearInterval(pump);
        reelSet.destroy();
        ticker.destroy();
      },
    };
  }
  const TUMBLE_GRID: ColumnTarget[] = Array.from({ length: 3 }, () => ({
    visible: ['a', 'a', 'a'],
  }));

  beforeEach(() => {
    resetNoticesForTest();
    setLogLevel('info');
  });

  it('holds the reel at rest and says the curve was dropped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = buildTumble();
    const reel = h.reelSet.reels[2];
    let maxSpeed = 0;
    const t = setInterval(() => {
      maxSpeed = Math.max(maxSpeed, Math.abs(reel.speed));
    }, 4);

    const p = h.reelSet.spin({ mode: 'cascade' });
    h.reelSet.setResult(TUMBLE_GRID);
    h.reelSet.setAnticipation([2], {
      duration: 200,
      curve: [{ speed: 0.5, duration: 100, hold: 60 }],
    });
    await p;
    clearInterval(t);

    // A tumble reel has already dropped its symbols. Scrolling it drags buffer
    // symbols back through the empty window.
    expect(maxSpeed).toBe(0);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/anticipation-curve-cascade/);
    warn.mockRestore();
    h.stop();
  });
});

describe('curve segments are validated at the call', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it.each([
    [{ speed: -2, duration: 300 }, /non-negative multiple of spinSpeed/],
    [{ speed: 0.3, duration: 0 }, /positive number of ms/],
    [{ speed: 0.3, duration: -50 }, /positive number of ms/],
    [{ speed: Number.NaN, duration: 300 }, /non-negative multiple of spinSpeed/],
    [{ speed: 0.3, duration: 300, hold: -9 }, /non-negative number of ms/],
  ])('rejects %o', (segment, message) => {
    const h = (harness = makeHarness());
    expect(() => h.reelSet.setAnticipation([4], { curve: [segment] })).toThrow(message);
  });

  it('names the segment index', () => {
    const h = (harness = makeHarness());
    expect(() =>
      h.reelSet.setAnticipation([4], {
        curve: [
          { speed: 1, duration: 100 },
          { speed: 0.2, duration: 0 },
        ],
      }),
    ).toThrow(/segment 1/);
  });

  it('validates the function form too, naming the reel and its tease order', () => {
    const h = (harness = makeHarness());
    expect(() =>
      h.reelSet.setAnticipation([3, 4], { curve: () => [{ speed: 0.2, duration: 0 }] }),
    ).toThrow(/reel 3 \(tease order 0\)/);
  });
});

describe('cells takes a per-reel function', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('hands each teasing reel its own travel target, in tease order', async () => {
    const h = (harness = makeHarness());
    const seen: Array<{ order: number; total: number }> = [];
    const travelled = new Map<number, number>();
    for (const i of [3, 4]) {
      const reel = h.reelSet.reels[i];
      reel.events.on('phase:enter', (name: string) => {
        if (name === 'anticipation') travelled.set(i, reel.travelledCells);
        if (name === 'stop' && travelled.has(i) && travelled.get(i)! >= 0) {
          travelled.set(i, reel.travelledCells - travelled.get(i)!);
        }
      });
    }

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([3, 4], {
      duration: 3000,
      curve: [{ speed: 0.9, duration: 40 }],
      cells: (order, total) => {
        seen.push({ order, total });
        return 1 + order * 2;
      },
    });
    await p;

    expect(seen).toEqual([
      { order: 0, total: 2 },
      { order: 1, total: 2 },
    ]);
    // Reel 4 is second in the tease, so it was asked for 3 cells against reel
    // 3's 1 - and travelled further for it.
    expect(travelled.get(4)!).toBeGreaterThan(travelled.get(3)!);
  });

  it('rejects a function that returns a non-positive count', () => {
    const h = (harness = makeHarness());
    expect(() =>
      h.reelSet.setAnticipation([4], { curve: [{ speed: 0.5, duration: 40 }], cells: () => 0 }),
    ).toThrow(/positive number of symbol pitches/);
  });
});

describe('anticipation:segment', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('announces each leg in order, so audio can hit the surge and the crawl apart', async () => {
    const h = (harness = makeHarness());
    const seen: Array<{ index: number; speed: number; targetSpeed: number }> = [];
    h.reelSet.events.on('anticipation:segment', (info) => {
      if (info.reelIndex === 4) seen.push(info);
    });

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], {
      duration: 400,
      curve: [
        { speed: 1.6, duration: 60 },
        { speed: 0.1, duration: 60, hold: 40 },
      ],
    });
    await p;

    expect(seen.map((s) => s.index)).toEqual([0, 1]);
    expect(seen[0].total).toBe(2);
    expect(seen[0].speed).toBe(1.6);
    // Reported in px/frame too, so a listener does not have to know the profile.
    expect(seen[0].targetSpeed).toBeCloseTo(FAST.spinSpeed * 1.6, 6);
  });

  it('stays silent for a legacy tease, which has no legs to announce', async () => {
    const h = (harness = makeHarness());
    const seen: number[] = [];
    h.reelSet.events.on('anticipation:segment', (info) => seen.push(info.index));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.setAnticipation([4], { duration: 120 });
    await p;

    expect(seen).toEqual([]);
  });
});
