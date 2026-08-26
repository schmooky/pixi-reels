/**
 * How skip granularity composes with the two subsystems that spin differently:
 * tumble cascades, and Hold & Win's one-ReelSet-per-cell board.
 *
 * Both were asked about rather than assumed, and the answers are not
 * symmetrical - cascades genuinely use tease protection, Hold & Win structurally
 * cannot - so each claim below is pinned instead of documented on trust.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
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

const grid = (reels: number): ColumnTarget[] =>
  Array.from({ length: reels }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness(opts: { reels: number; visibleCells?: number; tumble?: boolean }) {
  const h = createTestReelSet({
    reels: opts.reels,
    visibleCells: opts.visibleCells ?? 3,
    symbolIds: ['a', 'b', 'c'],
    ...(opts.tumble ? { tumble: {} } : {}),
  });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landed: number[] = [];
  const teased: number[] = [];
  h.reelSet.events.on('spin:reelLanded', (i) => { if (!landed.includes(i)) landed.push(i); });
  h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teased.push(reelIndex));
  return { ...h, landed, teased, stopPump: () => clearInterval(pump) };
}

describe('skip granularity composition', () => {
  let active: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    if (active) {
      active.stopPump();
      active.destroy();
      active = null;
    }
  });

  describe('tumble cascade', () => {
    it('a tease protects on the initial cascade spin', async () => {
      const h = (active = makeHarness({ reels: 5, tumble: true }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'once' });
      h.reelSet.setResult(grid(5));

      h.reelSet.skipSpin();
      // Anticipation runs before the tumble/standard split in the phase chain,
      // so a cascade spin teases and protects exactly like a strip spin.
      expect([...h.landed].sort()).toEqual([0, 1, 2]);
      expect(h.reelSet.skipStage).toBe(1);

      await p;
      expect([...h.teased].sort()).toEqual([3, 4]);
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it("a protected press defers the round's cascade side effect", async () => {
      const h = (active = makeHarness({ reels: 5, tumble: true }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'once' });
      h.reelSet.setResult(grid(5));

      // In cascade mode the round side effect is auto-slam-refills, not a
      // speed boost. A protected press must not spend it - stage stays 1.
      h.reelSet.skipSpin();
      expect(h.reelSet.skipStage).toBe(1);

      // The press that ends the tease is the one that claims it.
      h.reelSet.skipSpin();
      expect(h.reelSet.skipStage).toBe(2);
      await p;
    });

    it('a teased reel comes to rest, instead of scrolling for ever', async () => {
      // Regression: `AnticipationPhase` tweens `reel.speed` UP, and the tumble
      // stop path (`cascade:place` -> `cascade:dropIn`) never brings it back
      // down. only `StopPhase._landAndBounce` does that. So every teasing reel
      // in a cascade game was left running at the tease speed after the round
      // and drifted further off-grid every frame from then on.
      const h = (active = makeHarness({ reels: 5, tumble: true }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4]);
      h.reelSet.setResult(grid(5));
      await p;
      await new Promise((r) => setTimeout(r, 120));

      for (let i = 0; i < 5; i++) {
        expect(h.reelSet.getReel(i).speed, `reel ${i} still moving`).toBe(0);
      }
      expect([...h.teased].sort()).toEqual([3, 4]);
    });

    it('a tumble tease is a pure hold, with no strip movement', async () => {
      // The visible symbols already fell out, so scrolling would drag buffer
      // symbols back through the empty window.
      const h = (active = makeHarness({ reels: 5, tumble: true }));
      const speeds: number[] = [];
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { duration: 300 });
      h.reelSet.setResult(grid(5));

      const sampler = setInterval(() => {
        speeds.push(h.reelSet.getReel(3).speed, h.reelSet.getReel(4).speed);
      }, 16);
      await p;
      clearInterval(sampler);

      expect(speeds.length).toBeGreaterThan(0);
      expect(Math.max(...speeds)).toBe(0);
    });

    it('a partial slam during a refill leaves the other reels running', async () => {
      const h = (active = makeHarness({ reels: 5, tumble: true }));
      const p = h.reelSet.spin();
      h.reelSet.setResult(grid(5));
      await p;

      h.landed.length = 0;
      const refill = h.reelSet.refill({
        grid: grid(5),
        winners: [{ reel: 0, cell: 0 }, { reel: 1, cell: 0 }],
      });
      h.reelSet.slamStop({ reels: [0] });

      expect(h.landed).toEqual([0]);
      // The refill still settles, with the untouched reels landing normally.
      const result = await refill;
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(result.wasSkipped).toBe(true);
    });

    it('refills carry no tease, so protection is a spin-only concept', async () => {
      const h = (active = makeHarness({ reels: 5, tumble: true }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([3, 4], { protect: 'always' });
      h.reelSet.setResult(grid(5));
      h.reelSet.slamStop();
      await p;

      h.landed.length = 0;
      h.teased.length = 0;
      // `refill()` clears the anticipation set on entry; nothing carries over,
      // so a press inside a refill is an ordinary full slam.
      const refill = h.reelSet.refill({ grid: grid(5), winners: [{ reel: 0, cell: 0 }] });
      h.reelSet.skipSpin();
      expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(h.teased).toEqual([]);
      await refill;
    });
  });

  describe('Hold & Win board shape (one single-reel set per cell)', () => {
    it('a partial slam has no granularity to offer on a one-reel set', async () => {
      const h = (active = makeHarness({ reels: 1, visibleCells: 1 }));
      const p = h.reelSet.spin();
      h.reelSet.setResult(grid(1).map((c) => ({ visible: ['a'] })));

      // `except` and `reels` can only ever name reel 0 here, so both spellings
      // collapse to the plain full slam. Per-cell granularity is the board's
      // job (BoardGrid.skipSpinning), not the reel set's.
      h.reelSet.slamStop({ except: [] });
      expect(h.landed).toEqual([0]);
      await p;
    });

    it("'once' on a one-reel set burns the first press, then lands", async () => {
      const h = (active = makeHarness({ reels: 1, visibleCells: 1 }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([0], { protect: 'once' });
      h.reelSet.setResult([{ visible: ['a'] }]);

      // There is nothing outside the tease to land, so press 1 lands nothing.
      // That is protection working, not a bug: an impatient press is spent
      // making the tease visible rather than skipping past it.
      h.reelSet.skipSpin();
      expect(h.landed).toEqual([]);
      expect(h.reelSet.skipStage).toBe(1);

      h.reelSet.skipSpin();
      expect(h.landed).toEqual([0]);
      await p;
    });

    it("'stepwise' on a one-reel set lands it on the first press", async () => {
      const h = (active = makeHarness({ reels: 1, visibleCells: 1 }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([0], { protect: 'stepwise' });
      h.reelSet.setResult([{ visible: ['a'] }]);

      // With no non-tease group to land first, the release group IS the tease
      // reel, so one press is enough.
      h.reelSet.skipSpin();
      expect(h.landed).toEqual([0]);
      expect(h.reelSet.skipStage).toBe(2);
      await p;
    });

    it("'always' makes a press unable to land the cell at all", async () => {
      const h = (active = makeHarness({ reels: 1, visibleCells: 1 }));
      const p = h.reelSet.spin();
      h.reelSet.setAnticipation([0], { protect: 'always' });
      h.reelSet.setResult([{ visible: ['a'] }]);

      h.reelSet.skipSpin();
      h.reelSet.skipSpin();
      expect(h.landed).toEqual([]);

      // This is why `'always'` is the wrong mode for a Hold & Win cell:
      // `BoardGrid.skipSpinning()` presses `skipSpin()` and its error-recovery
      // path needs the cell to actually land. `slamStop()` still can.
      h.reelSet.slamStop();
      expect(h.landed).toEqual([0]);
      await p;
    });
  });
});
