/**
 * Skip granularity - per-reel slam, tease protection, per-reel spin floor.
 *
 * Before this change skip was all-or-nothing: `slamStop()` / `skipSpin()` /
 * `requestSkip()` force-completed EVERY reel's phase (including the skippable
 * `AnticipationPhase`), and the only per-reel lever, `setStopDelays()`, could
 * not go below the profile's single shared `minimumSpinTime` floor. So a
 * player who pressed skip on a teasing spin never saw the tease at all, and a
 * game that worked around it by raising the floor lost the snappy skip on
 * ordinary spins - and leaked a tell, since the skip response time then
 * differed between teasing and non-teasing spins.
 *
 * Mechanism notes that make these assertions robust:
 *   - `_slam` places and lands its target reels SYNCHRONOUSLY, so the state
 *     right after a `skipSpin()` / `slamStop()` call is already settled and
 *     can be asserted without awaiting anything.
 *   - A partial slam deliberately does NOT bump the spin generation (that is
 *     the global abort switch); it records the slammed indices instead, so
 *     the surviving reels' phase chains keep running to a natural landing.
 *   - `spin:reelLanded` fires once per reel from `_markLanded`, so the event
 *     log is the landing order.
 *   - GSAP self-ticks in node, so anticipation + stop phases complete on their
 *     own. We still pump the FakeTicker so reel motion and the phase `update`
 *     pump run realistically.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { StopPhase } from '../../src/index.js';
import type { StopPhaseConfig } from '../../src/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

// Fast profile: every reel starts together and SpinPhase can resolve the
// instant setResult arrives, so a skip press right after setResult catches
// every reel mid-SPIN.
const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 120,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

// Turbo-like: no anticipation window at all. A tease only plays via a
// per-call `duration` override, so protection has nothing to protect.
const TURBO0: SpeedProfile = { ...FAST, name: 'turbo0', anticipationDelay: 0 };

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({
  visible: ['a', 'b', 'c'],
}));

function makeHarness(
  profile: SpeedProfile = FAST,
  phases?: Parameters<typeof createTestReelSet>[0]['phases'],
) {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'], phases });
  h.reelSet.speed.addProfile(profile.name, profile);
  h.reelSet.setSpeed(profile.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landed: number[] = [];
  const landedAt = new Map<number, number>();
  h.reelSet.events.on('spin:reelLanded', (i) => {
    if (landedAt.has(i)) return;
    landed.push(i);
    landedAt.set(i, performance.now());
  });
  return {
    ...h,
    landed,
    landedAt,
    stopPump() {
      clearInterval(pump);
    },
  };
}

describe('skip granularity', () => {
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

  describe('tease protection', () => {
    it("'once' lands the reels around the tease and leaves the tease running", async () => {
      const h = (harness = makeHarness());
      const slams: Array<{ reels: number[]; partial: boolean }> = [];
      h.reelSet.events.on('skip:requested', (info) => slams.push(info));

      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'once' });
      h.reelSet.setResult(GRID);

      h.reelSet.skipSpin();

      // Synchronously after the press: the non-tease reels are down, the two
      // tease reels are still spinning.
      expect([...h.landed].sort()).toEqual([0, 1, 2]);
      expect(slams).toEqual([{ reels: [0, 1, 2], partial: true }]);
      // Stage 1, not 2: the round's side effect is owed to the press that
      // actually ends the tease.
      expect(h.reelSet.skipStage).toBe(1);

      const result = await p;
      // Reels 3 and 4 landed on their own, after the tease played.
      expect(h.landed).toEqual([0, 1, 2, 3, 4]);
      expect(result.wasSkipped).toBe(true);
    });

    it("'once' is spent: the next press ends the tease", async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'once' });
      h.reelSet.setResult(GRID);

      h.reelSet.skipSpin();
      expect([...h.landed].sort()).toEqual([0, 1, 2]);

      h.reelSet.skipSpin();
      // Second press slams the tease too, synchronously.
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(h.reelSet.skipStage).toBe(2);
      await p;
    });

    it("'always' never lets a press end the tease", async () => {
      const h = (harness = makeHarness());
      const teased: number[] = [];
      h.reelSet.events.on('anticipation:reel', (info) => teased.push(info.reelIndex));

      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'always' });
      h.reelSet.setResult(GRID);

      h.reelSet.skipSpin();
      expect([...h.landed].sort()).toEqual([0, 1, 2]);
      // Press again, and again: the tease reels are untouchable.
      h.reelSet.skipSpin();
      h.reelSet.skipSpin();
      expect([...h.landed].sort()).toEqual([0, 1, 2]);

      await p;
      // They landed naturally, having actually teased.
      expect([...teased].sort()).toEqual([3, 4]);
      expect(h.landed).toEqual([0, 1, 2, 3, 4]);
    });

    it('unprotected anticipation still slams whole (pre-2.3 behaviour)', async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4]);
      h.reelSet.setResult(GRID);

      h.reelSet.skipSpin();

      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(h.reelSet.skipStage).toBe(2);
      await p;
    });

    it('protection is inert when the tease would not play (turbo, hold 0)', async () => {
      const h = (harness = makeHarness(TURBO0));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'once' });
      h.reelSet.setResult(GRID);

      h.reelSet.skipSpin();

      // No tease to protect -> a plain full slam, so turbo has no skip-latency
      // tell between a teasing and a non-teasing spin.
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(h.reelSet.skipStage).toBe(2);
      await p;
    });

    it('a `duration` override revives protection in turbo', async () => {
      const h = (harness = makeHarness(TURBO0));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'once', duration: 120 });
      h.reelSet.setResult(GRID);

      h.reelSet.skipSpin();

      expect([...h.landed].sort()).toEqual([0, 1, 2]);
      await p;
      expect(h.landed).toEqual([0, 1, 2, 3, 4]);
    });

    it('a queued requestSkip() honours protection when the result arrives', async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      // Pressed before the result. exactly the window the feature exists for,
      // since the tease has not started yet.
      h.reelSet.setAnticipation([3, 4], { protect: 'once' });
      h.reelSet.requestSkip();
      h.reelSet.setResult(GRID);

      expect([...h.landed].sort()).toEqual([0, 1, 2]);
      await p;
      expect(h.landed).toEqual([0, 1, 2, 3, 4]);
    });

    it('slamStop() ignores protection entirely', async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'always' });
      h.reelSet.setResult(GRID);

      h.reelSet.slamStop();

      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      await p;
    });

    it('protection does not carry over to the next spin', async () => {
      const h = (harness = makeHarness());
      let p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'always' });
      h.reelSet.setResult(GRID);
      h.reelSet.slamStop();
      await p;

      h.landed.length = 0;
      h.landedAt.clear();
      p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4]); // no protect this time
      h.reelSet.setResult(GRID);
      h.reelSet.skipSpin();

      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      await p;
    });
  });

  describe('partial slam', () => {
    it('slamStop({ except }) leaves the excluded reels spinning', async () => {
      const h = (harness = makeHarness());
      const completed: Array<{ reels: number[]; partial: boolean }> = [];
      h.reelSet.events.on('skip:completed', (info) => completed.push(info));

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);

      h.reelSet.slamStop({ except: [3, 4] });

      expect([...h.landed].sort()).toEqual([0, 1, 2]);
      expect(completed).toEqual([{ reels: [0, 1, 2], partial: true }]);
      // A partial slam is not the round-ending press.
      expect(h.reelSet.skipStage).toBe(0);

      await p;
      expect(h.landed).toEqual([0, 1, 2, 3, 4]);
    });

    it('slamStop({ reels }) lands only those reels', async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);

      h.reelSet.slamStop({ reels: [4, 0] });

      expect([...h.landed].sort()).toEqual([0, 4]);
      await p;
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('a partial slam that lands nothing new is a no-op, not a skip', async () => {
      const h = (harness = makeHarness());
      const requested: unknown[] = [];
      h.reelSet.events.on('skip:requested', (info) => requested.push(info));

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);

      h.reelSet.slamStop({ reels: [0] });
      expect(requested).toHaveLength(1);
      // Reel 0 is already down; asking again must not re-fire the events.
      h.reelSet.slamStop({ reels: [0] });
      expect(requested).toHaveLength(1);

      await p;
    });

    it('a full slam reports partial: false', async () => {
      const h = (harness = makeHarness());
      const requested: Array<{ reels: number[]; partial: boolean }> = [];
      h.reelSet.events.on('skip:requested', (info) => requested.push(info));

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      h.reelSet.slamStop();
      await p;

      expect(requested).toEqual([{ reels: [0, 1, 2, 3, 4], partial: false }]);
    });

    it('rejects reels + except together', async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);

      expect(() => h.reelSet.slamStop({ reels: [0], except: [1] })).toThrow(/not both/);

      h.reelSet.slamStop();
      await p;
    });

    it('a partially slammed reel lands exactly once', async () => {
      const h = (harness = makeHarness());
      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);

      h.reelSet.slamStop({ reels: [1] });
      await p;

      // The aborted chain must not re-land reel 1 when it unwinds.
      expect(h.landed.filter((i) => i === 1)).toHaveLength(1);
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('minimum spin time override', () => {
    it('per-reel floors hold the listed reels back', async () => {
      const h = (harness = makeHarness());
      h.reelSet.setMinimumSpinTime([0, 0, 0, 300, 300]);

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      const t0 = performance.now();
      await p;

      // Reels 0-2 are under the profile's own floor (0) and land promptly;
      // 3-4 cannot land before their own 300ms floor.
      expect(h.landedAt.get(3)! - t0).toBeGreaterThan(250);
      expect(h.landedAt.get(4)! - t0).toBeGreaterThan(250);
      expect(h.landedAt.get(0)! - t0).toBeLessThan(250);
      expect(h.landed.slice(0, 3).sort()).toEqual([0, 1, 2]);
    });

    it('a uniform number applies to every reel', async () => {
      const h = (harness = makeHarness());
      h.reelSet.setMinimumSpinTime(500);

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      const t0 = performance.now();
      await p;

      // Well clear of the ~150ms this set takes to land on the bare profile,
      // so the assertion fails if the override is ignored.
      for (let i = 0; i < 5; i++) {
        expect(h.landedAt.get(i)! - t0).toBeGreaterThan(400);
      }
    });

    it('null clears the override and restores the profile floor', async () => {
      const h = (harness = makeHarness());
      h.reelSet.setMinimumSpinTime(500);
      h.reelSet.setMinimumSpinTime(null);

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      const t0 = performance.now();
      await p;

      expect(h.landedAt.get(4)! - t0).toBeLessThan(200);
    });

    it('a slam still lands instantly under a high floor', async () => {
      const h = (harness = makeHarness());
      h.reelSet.setMinimumSpinTime(5000);

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      h.reelSet.slamStop();

      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      await p;
    });
  });

  describe('phase subclassing', () => {
    it('a built-in phase can be subclassed and registered', async () => {
      let entered = 0;
      // Prove the export is a real, extensible class rather than a type-only
      // shape: subclass StopPhase and register it over the built-in, which is
      // the whole point of exporting it (a `PhaseFactory.register` with no
      // base class to extend means reimplementing the phase from scratch).
      class CountingStopPhase extends StopPhase {
        protected onEnter(config: StopPhaseConfig): void {
          entered++;
          super.onEnter(config);
        }
      }
      const h = (harness = makeHarness(FAST, (f) => f.register('stop', CountingStopPhase)));

      const p = h.reelSet.spin();
      h.reelSet.setResult(GRID);
      await p;

      expect(entered).toBe(5);
    });
  });
});
