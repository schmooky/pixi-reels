import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import { createTestReelSet, expectGrid } from '../../src/testing/index.js';
import { setGsap } from '../../src/utils/gsapRef.js';

/**
 * Replace gsap.to with a synchronous shim that drives the tween straight to
 * progress=1 and fires onUpdate + onComplete inline. The nudge algorithm
 * itself chunks displacements to under half a slot per call (so a single
 * full-progress onUpdate still wraps each step correctly), so this shim is
 * a faithful test of the placement algorithm without depending on raf.
 */
function installSyncGsap(): void {
  const sync = {
    ...defaultGsap,
    to: (target: { p: number }, vars: { onUpdate?: () => void; onComplete?: () => void }) => {
      target.p = 1;
      vars.onUpdate?.();
      vars.onComplete?.();
      return { kill: vi.fn() } as unknown as gsap.core.Tween;
    },
  } as unknown as typeof defaultGsap;
  setGsap(sync);
}

describe('nudge', () => {
  beforeEach(() => {
    installSyncGsap();
  });
  afterEach(() => {
    setGsap(defaultGsap);
  });

  describe('down nudge', () => {
    it('shifts the visible window down by 1 — incoming becomes the new top', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 3,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
        ]);
        const result = await reelSet.nudge(1, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
        });
        expect(result.symbols).toEqual(['wild', 'a', 'b']);
        // Other reels untouched.
        expectGrid(reelSet, [
          ['a', 'b', 'c'],
          ['wild', 'a', 'b'],
          ['a', 'b', 'c'],
        ]);
      } finally {
        destroy();
      }
    });

    it('shifts down by 2 with default buffer=1 — exercises the wrap queue', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'x', 'y'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const result = await reelSet.nudge(0, {
          distance: 2,
          direction: 'down',
          incoming: ['x', 'y'], // x is new top, y is below x
        });
        expect(result.symbols).toEqual(['x', 'y', 'a']);
      } finally {
        destroy();
      }
    });

    it('shifts down by 3 — every visible row is incoming', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'x', 'y', 'z'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const result = await reelSet.nudge(0, {
          distance: 3,
          direction: 'down',
          incoming: ['x', 'y', 'z'],
        });
        expect(result.symbols).toEqual(['x', 'y', 'z']);
      } finally {
        destroy();
      }
    });

  });

  describe('up nudge', () => {
    it('shifts the visible window up by 1 — incoming becomes the new bottom', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const result = await reelSet.nudge(0, {
          distance: 1,
          direction: 'up',
          incoming: ['wild'],
        });
        expect(result.symbols).toEqual(['b', 'c', 'wild']);
      } finally {
        destroy();
      }
    });

    it('shifts up by 2 with default buffer=1', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'x', 'y'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const result = await reelSet.nudge(0, {
          distance: 2,
          direction: 'up',
          incoming: ['x', 'y'], // x just below old c, y is new bottom
        });
        expect(result.symbols).toEqual(['c', 'x', 'y']);
      } finally {
        destroy();
      }
    });
  });

  describe('events', () => {
    it('emits nudge:start and nudge:complete on the reel-set bus', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const events: Array<{ name: string; info: unknown }> = [];
        reelSet.events.on('nudge:start', (info) => events.push({ name: 'nudge:start', info }));
        reelSet.events.on('nudge:complete', (info) => events.push({ name: 'nudge:complete', info }));

        await reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] });

        expect(events.map((e) => e.name)).toEqual(['nudge:start', 'nudge:complete']);
        expect(events[0].info).toEqual({ reelIndex: 0, distance: 1, direction: 'down' });
        expect(events[1].info).toEqual({
          reelIndex: 0,
          distance: 1,
          direction: 'down',
          symbols: ['wild', 'a', 'b'],
        });
      } finally {
        destroy();
      }
    });

    it('emits phase:enter / phase:exit("nudge") on the per-reel bus', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const phases: string[] = [];
        reelSet.reels[0].events.on('phase:enter', (n) => {
          if (n === 'nudge') phases.push('enter:nudge');
        });
        reelSet.reels[0].events.on('phase:exit', (n) => {
          if (n === 'nudge') phases.push('exit:nudge');
        });
        await reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] });
        expect(phases).toEqual(['enter:nudge', 'exit:nudge']);
      } finally {
        destroy();
      }
    });
  });

  describe('parallel nudges', () => {
    it('Promise.all across two reels lands independently', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 3,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild', 'star'],
      });
      try {
        await spinAndLand([
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
          ['a', 'b', 'c'],
        ]);
        await Promise.all([
          reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] }),
          reelSet.nudge(2, { distance: 1, direction: 'up', incoming: ['star'] }),
        ]);
        expectGrid(reelSet, [
          ['wild', 'a', 'b'],
          ['a', 'b', 'c'],
          ['b', 'c', 'star'],
        ]);
      } finally {
        destroy();
      }
    });
  });

  describe('validation', () => {
    it('throws when reel set is currently spinning', async () => {
      const { reelSet, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'wild'],
      });
      try {
        const p = reelSet.spin();
        await expect(
          reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] }),
        ).rejects.toThrow(/cannot nudge while a spin/);
        reelSet.setResult([['a', 'b', 'a']]);
        reelSet.slamStop();
        await p;
      } finally {
        destroy();
      }
    });

    it('throws on out-of-range col', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 2,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([
          ['a', 'a', 'a'],
          ['a', 'a', 'a'],
        ]);
        await expect(
          reelSet.nudge(5, { distance: 1, direction: 'down', incoming: ['wild'] }),
        ).rejects.toThrow(/out of range/);
        await expect(
          reelSet.nudge(-1, { distance: 1, direction: 'down', incoming: ['wild'] }),
        ).rejects.toThrow(/out of range/);
      } finally {
        destroy();
      }
    });

    it('throws on bad distance', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        await expect(
          reelSet.nudge(0, { distance: 0, direction: 'down', incoming: [] }),
        ).rejects.toThrow(/positive integer/);
        await expect(
          reelSet.nudge(0, { distance: 1.5, direction: 'down', incoming: ['wild'] }),
        ).rejects.toThrow(/positive integer/);
      } finally {
        destroy();
      }
    });

    it('throws when incoming length mismatches distance', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        await expect(
          reelSet.nudge(0, { distance: 2, direction: 'down', incoming: ['wild'] }),
        ).rejects.toThrow(/exactly 2 symbol id/);
      } finally {
        destroy();
      }
    });

    it('throws when incoming contains an unregistered symbol', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        await expect(
          reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['unknown'] }),
        ).rejects.toThrow(/is not registered/);
      } finally {
        destroy();
      }
    });

    it('throws when the target reel has an active pin', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        reelSet.pin(0, 1, 'wild');
        await expect(
          reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] }),
        ).rejects.toThrow(/active pin/);
      } finally {
        destroy();
      }
    });
  });

  describe('post-nudge state', () => {
    it('leaves the reel ready for a normal spin afterward', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        await reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] });
        expect(reelSet.reels[0].isNudging).toBe(false);
        expect(reelSet.reels[0].speed).toBe(0);

        // Now a fresh spin works.
        await spinAndLand([['a', 'a', 'a']]);
        expectGrid(reelSet, [['a', 'a', 'a']]);
      } finally {
        destroy();
      }
    });
  });
});
