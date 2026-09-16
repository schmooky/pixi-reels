/**
 * `requestHurry()`: a press that lands the reels it frees through their
 * normal stop instead of placing them.
 *
 * Every press path used to end in `_slam()`, which places the frame and
 * lands in the same tick: the landing animation still played, but on symbols
 * already parked, so a press read as a cut. A game that wanted a pressed reel
 * to spin out and bounce had to keep the press away from the engine, hold a
 * handle on the live phase and call `skip()` on it itself. The hurry walks
 * the same release plan a slam does (tease protection, stepwise, groups) and
 * asks each freed reel to reach its natural landing sooner: the tease ends,
 * the stop delay is cut, the spin-out and bounce still play.
 *
 * Mechanism notes:
 *   - GSAP self-ticks on the real clock in node, so stop delays, teases and
 *     bounces run in real time. Bounds below are generous for that reason.
 *   - A hurried reel lands through `_markLanded` like any other, so
 *     `spin:reelLanding` / `spin:reelLanded` are the landing record.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import { resetNoticesForTest, setLogLevel } from '../../src/utils/notify.js';
import type { StopPhaseConfig } from '../../src/spin/phases/StopPhase.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const STOP_DELAY = 300;
const BOUNCE_MS = 200;
const TEASE_MS = 1500;

/**
 * A stagger worth cutting, a bounce worth measuring, a tease worth ending.
 * Every reel starts together so a press right after `setResult` catches them
 * all in SPIN.
 */
const NORMAL: SpeedProfile = {
  name: 'normal',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: STOP_DELAY,
  anticipationDelay: TEASE_MS,
  bounceDistance: 8,
  bounceDuration: BOUNCE_MS,
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

/** A short bounce, to tell "landed on the named profile" from "landed on its own". */
const TURBO: SpeedProfile = { ...NORMAL, name: 'turbo', spinSpeed: 60, bounceDuration: 60 };

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness(phases?: (f: PhaseFactory) => void, tumble = false) {
  const h = createTestReelSet({
    reels: 5,
    visibleCells: 3,
    symbolIds: ['a', 'b', 'c'],
    phases,
    tumble: tumble ? {} : undefined,
  });
  h.reelSet.speed.addProfile(NORMAL.name, NORMAL);
  h.reelSet.speed.addProfile(TURBO.name, TURBO);
  h.reelSet.setSpeed(NORMAL.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landingAt = new Map<number, number>();
  const landedAt = new Map<number, number>();
  const hurries: number[][] = [];
  const slams: number[][] = [];
  h.reelSet.events.on('spin:reelLanding', (i) => landingAt.set(i, performance.now()));
  h.reelSet.events.on('spin:reelLanded', (i) => landedAt.set(i, performance.now()));
  h.reelSet.events.on('hurry:requested', ({ reels }) => hurries.push(reels));
  h.reelSet.events.on('skip:requested', ({ reels }) => slams.push(reels));
  return {
    ...h,
    landingAt,
    landedAt,
    hurries,
    slams,
    /** How long a reel's bounce took: landing frame to settle. */
    bounceMs(i: number): number {
      return landedAt.get(i)! - landingAt.get(i)!;
    },
    stopPump() {
      clearInterval(pump);
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Resolves the first time `event` fires for `reelIndex`. */
function once(h: ReturnType<typeof makeHarness>, event: 'spin:stopping' | 'anticipation:reel', reelIndex: number): Promise<void> {
  return new Promise((resolve) => {
    const handler = (info: number | { reelIndex: number }): void => {
      const i = typeof info === 'number' ? info : info.reelIndex;
      if (i !== reelIndex) return;
      h.reelSet.events.off(event, handler);
      resolve();
    };
    h.reelSet.events.on(event, handler);
  });
}

describe('requestHurry()', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;

  beforeEach(() => {
    harness = null;
    resetNoticesForTest();
    setLogLevel('info');
  });

  afterEach(() => {
    if (harness) {
      harness.stopPump();
      harness.destroy();
      harness = null;
    }
    vi.restoreAllMocks();
  });

  it('lands every freed reel through its stop: a bounce apart, together, and never as a skip', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([[0, 1, 2, 3, 4]]);
    // Nothing is placed: the reels are still in flight after the press.
    expect(h.landedAt.size).toBe(0);

    const result = await p;
    expect(result.wasSkipped).toBe(false);
    expect(h.slams).toEqual([]);
    for (let i = 0; i < 5; i++) {
      // The landing frame and the settle are a whole bounce apart on every
      // reel. A slam fires them in the same tick.
      expect(h.bounceMs(i)).toBeGreaterThanOrEqual(BOUNCE_MS * 0.7);
    }
    // The stagger was cut: five reels that would have landed 300 ms apart land
    // within a fraction of one stop delay of each other.
    const settled = [...h.landedAt.values()];
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(STOP_DELAY);
  });

  it('is felt: a hurried round settles sooner than the same round left alone', async () => {
    const h = (harness = makeHarness());
    const t0 = performance.now();
    const p1 = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p1;
    const natural = performance.now() - t0;

    const t1 = performance.now();
    const p2 = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestHurry();
    await p2;
    const hurried = performance.now() - t1;

    // Four stop delays' worth of stagger is gone from the hurried round.
    expect(natural - hurried).toBeGreaterThan(STOP_DELAY * 2);
  });

  it('cuts a stop delay already scheduled: the reel spins out at once', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Every reel has entered its stop phase and is sitting in its delay.
    await once(h, 'spin:stopping', 4);
    const pressed = performance.now();
    h.reelSet.requestHurry();

    await p;
    // Reel 4 owed 4 * 300 ms of delay; after the press it lands in well under one.
    expect(h.landedAt.get(4)! - pressed).toBeLessThan(STOP_DELAY * 2);
    expect(h.bounceMs(4)).toBeGreaterThanOrEqual(BOUNCE_MS * 0.7);
  });

  it('ends a tease early and still spins the reel out onto its frame', async () => {
    const h = (harness = makeHarness());
    const teaseEnded: number[] = [];
    h.reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => teaseEnded.push(reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([4]);
    h.reelSet.setResult(GRID);
    await once(h, 'anticipation:reel', 4);
    // Let the other four land on their own first, so the press frees the
    // teasing reel alone. Its tease is 1500 ms; they are down well inside it.
    for (let i = 0; i < 400 && h.landedAt.size < 4; i++) await sleep(5);
    expect(h.landedAt.size).toBe(4);
    const pressed = performance.now();
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([[4]]);

    await p;
    // The tease was genuinely shorter than its scripted hold...
    expect(h.landedAt.get(4)! - pressed).toBeLessThan(TEASE_MS * 0.6);
    // ...and the reel still bounced, rather than being placed.
    expect(h.bounceMs(4)).toBeGreaterThanOrEqual(BOUNCE_MS * 0.7);
    expect(teaseEnded).toEqual([4]);
    expect(h.slams).toEqual([]);
  });

  it('skips the tease of a reel hurried before it began teasing', async () => {
    const h = (harness = makeHarness());
    const teased: number[] = [];
    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teased.push(reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4], { stagger: 'sequential' });
    h.reelSet.setResult(GRID);
    h.reelSet.requestHurry();
    await p;
    // A press asked for the landing; the tease is not part of it.
    expect(teased).toEqual([]);
    expect(h.bounceMs(4)).toBeGreaterThanOrEqual(BOUNCE_MS * 0.7);
  });

  it("walks a 'stepwise' tease one press at a time and moves on past reels still landing", async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4], { protect: 'stepwise' });
    h.reelSet.setResult(GRID);

    h.reelSet.requestHurry();
    // The reels around the tease are freed; the tease is left alone.
    expect(h.hurries).toEqual([[0, 1, 2]]);
    // A second press before they have landed frees the NEXT beat rather than
    // re-freeing the first: a hurried reel counts as released for the walk.
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([[0, 1, 2], [3]]);
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([[0, 1, 2], [3], [4]]);
    // Nothing left to free: a fourth press emits nothing.
    h.reelSet.requestHurry();
    expect(h.hurries.length).toBe(3);

    const result = await p;
    expect(result.wasSkipped).toBe(false);
    expect(h.slams).toEqual([]);
    expect(h.reelSet.skipStage).toBe(0);
  });

  it('honours reel groups: a press frees the next group, in order', async () => {
    const h = (harness = makeHarness());
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.requestHurry();
    h.reelSet.requestHurry();
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([[0, 1], [2, 3], [4]]);

    const result = await p;
    expect(result.wasSkipped).toBe(false);
    // The barrier held: later groups landed after earlier ones.
    expect(h.landedAt.get(2)!).toBeGreaterThanOrEqual(h.landedAt.get(1)!);
    expect(h.landedAt.get(4)!).toBeGreaterThanOrEqual(h.landedAt.get(3)!);
    h.reelSet.setReelGroups(null);
  });

  it('leaves the slam available: requestSkip() after it cuts whatever is still moving', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.requestHurry();
    h.reelSet.requestSkip();
    // Slammed synchronously: every hurried reel was still un-landed.
    expect(h.slams).toEqual([[0, 1, 2, 3, 4]]);
    expect([...h.landedAt.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    const result = await p;
    expect(result.wasSkipped).toBe(true);
  });

  it('lands the hurried stop on the named profile', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestHurry({ speed: 'turbo' });
    await p;
    for (let i = 0; i < 5; i++) {
      // Turbo's 60 ms bounce, not normal's 200 ms.
      expect(h.bounceMs(i)).toBeLessThan(BOUNCE_MS * 0.7);
    }
    // The blur reference follows the profile the reel landed on.
    expect(h.reelSet.reels[0].referenceSpeed).toBe(TURBO.spinSpeed);
  });

  it('throws on a profile name nobody registered', () => {
    const h = (harness = makeHarness());
    void h.reelSet.spin();
    expect(() => h.reelSet.requestHurry({ speed: 'nope' })).toThrow(/no speed profile named 'nope'/);
    h.reelSet.slamStop();
  });

  it('queues before setResult() and fires when the result arrives', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([]);
    h.reelSet.setResult(GRID);
    expect(h.hurries).toEqual([[0, 1, 2, 3, 4]]);
    await p;
  });

  it('is a no-op while idle', () => {
    const h = (harness = makeHarness());
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([]);
  });

  it('lets a phase that cannot be hurried run its course, and lands anyway', async () => {
    let asked = 0;
    class StubbornStopPhase extends ReelPhase<StopPhaseConfig> {
      readonly name = 'stop';
      readonly skippable = true;
      private _elapsed = 0;
      private _config: StopPhaseConfig | null = null;
      protected onEnter(config: StopPhaseConfig): void {
        this._config = config;
        this._elapsed = 0;
      }
      update(deltaMs: number): void {
        this._elapsed += deltaMs;
        if (this._elapsed < 100 || !this._config) return;
        this.reel.placeStrip(this._config.targetFrame);
        this.land();
        this._config = null;
        this._complete();
      }
      protected onSkip(): void {
        if (this._config) this.reel.placeStrip(this._config.targetFrame);
        this._config = null;
      }
      override hurry(): boolean {
        asked++;
        return super.hurry();
      }
    }
    const h = (harness = makeHarness((f) => f.register('stop', StubbornStopPhase)));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await once(h, 'spin:stopping', 4);
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([[0, 1, 2, 3, 4]]);
    const result = await p;
    // Every stop phase was asked, none obliged, and the round still settled.
    expect(asked).toBe(5);
    expect(result.wasSkipped).toBe(false);
  });

  it('slams in cascade mode and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = (harness = makeHarness(undefined, true));
    const p = h.reelSet.spin({ mode: 'cascade' });
    h.reelSet.setResult(GRID);
    h.reelSet.requestHurry();
    h.reelSet.requestHurry();
    expect(h.hurries).toEqual([]);
    expect(h.slams.length).toBeGreaterThanOrEqual(1);
    const notices = warn.mock.calls.filter((c) => String(c[0]).includes('hurry-cascade'));
    expect(notices.length).toBe(1);
    await p;
  });
});
