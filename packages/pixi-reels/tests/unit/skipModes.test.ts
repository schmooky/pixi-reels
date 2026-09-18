/**
 * `requestSkip({ mode: 'quicken' })`: a press that lands the reels it frees
 * through their normal stop instead of placing them.
 *
 * Every press path used to end in a slam, which places the frame and lands
 * in the same tick: the landing animation still played, but on symbols
 * already parked, so a press read as a cut. The quicken mode walks the same
 * release plan a slam does (tease protection, stepwise, groups) and asks
 * each freed reel to reach its natural landing sooner: the tease ends, the
 * stop delay is cut, the spin-out and bounce still play.
 *
 * Mechanism notes:
 *   - GSAP self-ticks on the real clock in node, so stop delays, teases and
 *     bounces run in real time. Bounds below are generous for that reason.
 *   - A quickened reel lands through `_markLanded` like any other, so
 *     `spin:reelLanding` / `spin:reelLanded` are the landing record.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import { StopPhase } from '../../src/spin/phases/StopPhase.js';
import { resetNoticesForTest, setLogLevel } from '../../src/utils/notify.js';
import type { StopPhaseConfig } from '../../src/spin/phases/StopPhase.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';
import type { SkipContext, SkipMode, SpeedProfile } from '../../src/config/types.js';
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

const QUICKEN = { mode: 'quicken' as const };

function makeHarness(phases?: (f: PhaseFactory) => void, tumble = false, skipMode?: SkipMode) {
  const h = createTestReelSet({
    reels: 5,
    visibleCells: 3,
    symbolIds: ['a', 'b', 'c'],
    phases,
    tumble: tumble ? {} : undefined,
    skipMode,
  });
  h.reelSet.speed.addProfile(NORMAL.name, NORMAL);
  h.reelSet.speed.addProfile(TURBO.name, TURBO);
  h.reelSet.setSpeed(NORMAL.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landingAt = new Map<number, number>();
  const landedAt = new Map<number, number>();
  const requested: Array<{ reels: number[]; partial: boolean; mode: SkipMode }> = [];
  const completed: Array<{ reels: number[]; partial: boolean; mode: SkipMode }> = [];
  h.reelSet.events.on('spin:reelLanding', (i) => landingAt.set(i, performance.now()));
  h.reelSet.events.on('spin:reelLanded', (i) => landedAt.set(i, performance.now()));
  h.reelSet.events.on('skip:requested', (info) => requested.push(info));
  h.reelSet.events.on('skip:completed', (info) => completed.push(info));
  return {
    ...h,
    landingAt,
    landedAt,
    requested,
    completed,
    /** The reels each press freed, by mode. */
    freed(mode: SkipMode): number[][] {
      return requested.filter((r) => r.mode === mode).map((r) => r.reels);
    },
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

describe("requestSkip({ mode: 'quicken' })", () => {
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

  it('lands every freed reel through its stop: a bounce apart, together, and reported as a quicken', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.requestSkip(QUICKEN);
    expect(h.requested).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'quicken' }]);
    // Nothing is placed: the reels are still in flight after the press, and
    // the press is not complete until they are down.
    expect(h.landedAt.size).toBe(0);
    expect(h.completed).toEqual([]);
    // A quicken is a skip: the stage advances as it would for a slam.
    expect(h.reelSet.skipStage).toBe(2);

    const result = await p;
    expect(result.wasSkipped).toBe(true);
    expect(result.skipMode).toBe('quicken');
    expect(h.completed).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'quicken' }]);
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

  it('is felt: a quickened round settles sooner than the same round left alone', async () => {
    const h = (harness = makeHarness());
    const t0 = performance.now();
    const p1 = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p1;
    const natural = performance.now() - t0;

    const t1 = performance.now();
    const p2 = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip(QUICKEN);
    await p2;
    const quickened = performance.now() - t1;

    // Four stop delays' worth of stagger is gone from the quickened round.
    expect(natural - quickened).toBeGreaterThan(STOP_DELAY * 2);
  });

  it('cuts a stop delay already scheduled: the reel spins out at once', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Every reel has entered its stop phase and is sitting in its delay.
    await once(h, 'spin:stopping', 4);
    const pressed = performance.now();
    h.reelSet.requestSkip(QUICKEN);

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
    h.reelSet.requestSkip(QUICKEN);
    expect(h.freed('quicken')).toEqual([[4]]);

    await p;
    // The tease was genuinely shorter than its scripted hold...
    expect(h.landedAt.get(4)! - pressed).toBeLessThan(TEASE_MS * 0.6);
    // ...and the reel still bounced, rather than being placed.
    expect(h.bounceMs(4)).toBeGreaterThanOrEqual(BOUNCE_MS * 0.7);
    expect(teaseEnded).toEqual([4]);
    expect(h.freed('slam')).toEqual([]);
  });

  it('skips the tease of a reel quickened before it began teasing', async () => {
    const h = (harness = makeHarness());
    const teased: number[] = [];
    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teased.push(reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4], { stagger: 'sequential' });
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip(QUICKEN);
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

    h.reelSet.requestSkip(QUICKEN);
    // The reels around the tease are freed; the tease is left alone.
    expect(h.freed('quicken')).toEqual([[0, 1, 2]]);
    expect(h.reelSet.skipStage).toBe(1);
    // A second press before they have landed frees the NEXT beat rather than
    // re-freeing the first: a quickened reel counts as released for the walk.
    h.reelSet.requestSkip(QUICKEN);
    expect(h.freed('quicken')).toEqual([[0, 1, 2], [3]]);
    h.reelSet.requestSkip(QUICKEN);
    expect(h.freed('quicken')).toEqual([[0, 1, 2], [3], [4]]);
    // That press emptied the round: stage 2, decided before the reels are down.
    expect(h.reelSet.skipStage).toBe(2);
    // Nothing left to free: a fourth press emits nothing.
    h.reelSet.requestSkip(QUICKEN);
    expect(h.requested.length).toBe(3);

    const result = await p;
    expect(result.wasSkipped).toBe(true);
    expect(h.freed('slam')).toEqual([]);
    // Each press completed as its last reel landed.
    expect(h.completed.map((c) => c.reels)).toEqual([[0, 1, 2], [3], [4]]);
  });

  it('honours reel groups: a press frees the next group, in order', async () => {
    const h = (harness = makeHarness());
    h.reelSet.setReelGroups([[0, 1], [2, 3], [4]]);
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.requestSkip(QUICKEN);
    h.reelSet.requestSkip(QUICKEN);
    h.reelSet.requestSkip(QUICKEN);
    expect(h.freed('quicken')).toEqual([[0, 1], [2, 3], [4]]);

    const result = await p;
    expect(result.wasSkipped).toBe(true);
    // The barrier held: later groups landed after earlier ones.
    expect(h.landedAt.get(2)!).toBeGreaterThanOrEqual(h.landedAt.get(1)!);
    expect(h.landedAt.get(4)!).toBeGreaterThanOrEqual(h.landedAt.get(3)!);
    h.reelSet.setReelGroups(null);
  });

  it('leaves the slam available: a slam press after it cuts whatever is still moving', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);

    h.reelSet.requestSkip(QUICKEN);
    h.reelSet.requestSkip({ mode: 'slam' });
    // Slammed synchronously: every quickened reel was still un-landed.
    expect(h.freed('slam')).toEqual([[0, 1, 2, 3, 4]]);
    expect([...h.landedAt.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    // The quicken completed too: its reels are down, however they got there.
    expect(h.completed.map((c) => c.mode)).toEqual(['quicken', 'slam']);
    const result = await p;
    expect(result.wasSkipped).toBe(true);
    expect(result.skipMode).toBe('slam');
  });

  it('lands the quickened stop on the named profile', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip({ mode: 'quicken', speed: 'turbo' });
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
    expect(() => h.reelSet.requestSkip({ mode: 'quicken', speed: 'nope' })).toThrow(/no speed profile named 'nope'/);
    h.reelSet.setResult(GRID);
    h.reelSet.slamStop();
  });

  it('queues before setResult() and fires when the result arrives', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.requestSkip(QUICKEN);
    expect(h.requested).toEqual([]);
    h.reelSet.setResult(GRID);
    expect(h.freed('quicken')).toEqual([[0, 1, 2, 3, 4]]);
    await p;
  });

  it('is a no-op while idle', () => {
    const h = (harness = makeHarness());
    h.reelSet.requestSkip(QUICKEN);
    expect(h.requested).toEqual([]);
  });

  it("takes the builder's skipMode when the press does not say", async () => {
    const h = (harness = makeHarness(undefined, false, 'quicken'));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip();
    expect(h.freed('quicken')).toEqual([[0, 1, 2, 3, 4]]);
    // An explicit mode still wins over the default.
    h.reelSet.requestSkip({ mode: 'slam' });
    expect(h.freed('slam')).toEqual([[0, 1, 2, 3, 4]]);
    await p;
  });

  it('hands the payload to every phase the press reaches', async () => {
    const seen: unknown[] = [];
    class NosyStopPhase extends StopPhase {
      protected override onSkip(ctx: SkipContext): void {
        seen.push(ctx.payload);
        super.onSkip(ctx);
      }
    }
    const h = (harness = makeHarness((f) => f.register('stop', NosyStopPhase)));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await once(h, 'spin:stopping', 4);
    h.reelSet.requestSkip({ mode: 'quicken', payload: { button: 'turbo' } });
    await p;
    expect(seen).toEqual(Array.from({ length: 5 }, () => ({ button: 'turbo' })));
  });

  it('leaves a phase that never declared quickenable alone, and it lands anyway', async () => {
    // A 2.8-style stop: slam pose only, no `quickenable`. A quicken must not
    // reach its `onSkip`, which would kill its tween with nobody left to
    // complete the phase.
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
        asked++;
        if (this._config) this.reel.placeStrip(this._config.targetFrame);
        this._config = null;
      }
    }
    const h = (harness = makeHarness((f) => f.register('stop', StubbornStopPhase)));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await once(h, 'spin:stopping', 4);
    h.reelSet.requestSkip(QUICKEN);
    expect(h.freed('quicken')).toEqual([[0, 1, 2, 3, 4]]);
    const result = await p;
    // No stop phase heard the press, and the round still settled on its own.
    expect(asked).toBe(0);
    expect(result.wasSkipped).toBe(true);
    expect(result.skipMode).toBe('quicken');
  });

  it('asks the stop phase a reel creates after the press to quicken too', async () => {
    // A stop with a wait of its own: 400 ms of hold before the built-in
    // spin-out. A quicken cuts the hold; one that arrived before this phase
    // existed must reach it all the same.
    const asked: number[] = [];
    class HeldStopPhase extends StopPhase {
      private _held: StopPhaseConfig | null = null;
      private _timer: ReturnType<typeof setTimeout> | null = null;
      protected override onEnter(config: StopPhaseConfig): void {
        this._held = config;
        this._timer = setTimeout(() => this._release(), 400);
      }
      private _release(): void {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        const config = this._held;
        this._held = null;
        if (config) super.onEnter(config);
      }
      protected override onSkip(ctx: SkipContext): void {
        if (ctx.mode === 'quicken') asked.push(this.reel.reelIndex);
        if (this._held) this._release();
        super.onSkip(ctx);
      }
    }
    const h = (harness = makeHarness((f) => f.register('stop', HeldStopPhase)));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    // Pressed while every reel is still in SPIN: no stop phase exists yet.
    const pressed = performance.now();
    h.reelSet.requestSkip(QUICKEN);
    await p;
    expect([...asked].sort()).toEqual([0, 1, 2, 3, 4]);
    // The hold was cut on every reel, so the round is down well inside 400 ms
    // plus a spin-out, rather than 400 ms after the last stagger.
    expect(Math.max(...h.landedAt.values()) - pressed).toBeLessThan(400 + STOP_DELAY);
  });

  it('slams in cascade mode and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = (harness = makeHarness(undefined, true));
    const p = h.reelSet.spin({ mode: 'cascade' });
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip(QUICKEN);
    h.reelSet.requestSkip(QUICKEN);
    expect(h.freed('quicken')).toEqual([]);
    expect(h.freed('slam').length).toBeGreaterThanOrEqual(1);
    const notices = warn.mock.calls.filter((c) => String(c[0]).includes('quicken-cascade'));
    expect(notices.length).toBe(1);
    await p;
  });
});

describe('the stage a listener sees', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('is already 2 inside spin:complete when a slam ends the round', async () => {
    const h = (harness = makeHarness());
    let stageAtComplete = -1;
    h.reelSet.events.on('spin:complete', () => {
      stageAtComplete = h.reelSet.skipStage;
    });
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip({ mode: 'slam' });
    await p;
    expect(stageAtComplete).toBe(2);

    // The same through slamStop(), bare and as a set that covers the board.
    const p2 = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    stageAtComplete = -1;
    h.reelSet.slamStop({ reels: [0, 1, 2, 3, 4] });
    await p2;
    expect(stageAtComplete).toBe(2);
  });

  it('slamStop() before setResult() throws instead of landing on nothing', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    expect(() => h.reelSet.slamStop()).toThrow(/before setResult\(\)/);
    h.reelSet.setResult(GRID);
    h.reelSet.slamStop();
    await p;
  });
});

describe('the press rides on the events and the result', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    if (harness) {
      harness.stopPump();
      harness.destroy();
      harness = null;
    }
  });

  it('carries a quicken press, profile and payload included, on both events and into SpinResult.skipContext', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    const payload = { button: 'skip', player: 7 };
    h.reelSet.requestSkip({ mode: 'quicken', speed: 'turbo', payload });
    expect(h.requested).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'quicken', speed: TURBO, payload }]);
    const result = await p;
    expect(h.completed).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'quicken', speed: TURBO, payload }]);
    expect(result.skipMode).toBe('quicken');
    expect(result.skipContext).toEqual({ mode: 'quicken', speed: TURBO, payload });
    // The event's object is the press as `onSkip(ctx)` saw it, not the
    // engine's own: mutating it changes nothing downstream.
    expect(h.requested[0]).not.toBe(h.completed[0]);
  });

  it('carries a slam press and its payload, and leaves the keys it did not set absent', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip({ mode: 'slam', payload: 'second press' });
    expect(h.requested).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'slam', payload: 'second press' }]);
    expect(h.completed).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'slam', payload: 'second press' }]);
    expect('speed' in h.requested[0]!).toBe(false);
    const result = await p;
    expect(result.skipContext).toEqual({ mode: 'slam', payload: 'second press' });
    expect('speed' in result.skipContext!).toBe(false);
  });

  it('keeps the payload of a press queued before the result', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    // Pre-result: queued, and fired the moment the result arrives.
    h.reelSet.requestSkip({ mode: 'quicken', payload: { queued: true } });
    expect(h.requested).toEqual([]);
    h.reelSet.setResult(GRID);
    expect(h.requested).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'quicken', payload: { queued: true } }]);
    const result = await p;
    expect(result.skipContext).toEqual({ mode: 'quicken', payload: { queued: true } });
  });

  it('says a pre-result press was queued, with the press on it', async () => {
    const h = (harness = makeHarness());
    const queued: unknown[] = [];
    h.reelSet.events.on('skip:queued', (info) => queued.push(info));
    const p = h.reelSet.spin();
    h.reelSet.requestSkip({ mode: 'quicken', speed: 'turbo', payload: 'early' });
    expect(queued).toEqual([{ mode: 'quicken', speed: TURBO, payload: 'early' }]);
    expect(h.requested).toEqual([]);
    h.reelSet.setResult(GRID);
    expect(h.requested).toHaveLength(1);
    await p;
  });

  it('reports an engine slam as a bare { mode: "slam" }', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.slamStop();
    expect(h.requested).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false, mode: 'slam' }]);
    const result = await p;
    expect(result.skipMode).toBe('slam');
    expect(result.skipContext).toEqual({ mode: 'slam' });
  });

  it('reports the last press that freed reels: a quicken then a slam ends as the slam', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    h.reelSet.requestSkip({ mode: 'quicken', payload: 1 });
    h.reelSet.requestSkip({ mode: 'slam', payload: 2 });
    const result = await p;
    expect(h.requested.map((r) => r.payload)).toEqual([1, 2]);
    expect(result.skipContext).toEqual({ mode: 'slam', payload: 2 });
  });
});
