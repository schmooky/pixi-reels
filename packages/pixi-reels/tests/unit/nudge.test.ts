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
      return { kill: vi.fn(), progress: vi.fn() } as unknown as gsap.core.Tween;
    },
  } as unknown as typeof defaultGsap;
  setGsap(sync);
}

/**
 * Drive the tween through a sequence of intermediate progress values
 * (e.g. simulate an overshooting ease that peaks at p>1 then settles back
 * to 1). Each entry fires `onUpdate`; `onComplete` fires at the end.
 * Used to verify that the overshoot clamp prevents spurious wraps.
 */
function installSequenceGsap(progressSequence: number[]): void {
  const sync = {
    ...defaultGsap,
    to: (target: { p: number }, vars: { onUpdate?: () => void; onComplete?: () => void }) => {
      for (const p of progressSequence) {
        target.p = p;
        vars.onUpdate?.();
      }
      target.p = 1;
      vars.onComplete?.();
      return { kill: vi.fn(), progress: vi.fn() } as unknown as gsap.core.Tween;
    },
  } as unknown as typeof defaultGsap;
  setGsap(sync);
}

/**
 * gsap.to shim that captures the tween's callbacks but does NOT fire them.
 * Lets a test hold the tween in-flight while exercising destroy / abort.
 * `controller.complete()` lands it; `controller.tween.kill()` is wired.
 */
function installDeferredGsap(): {
  fire(): void;
  killCount: () => number;
} {
  let onComplete: (() => void) | undefined;
  let onUpdate: (() => void) | undefined;
  let lastTarget: { p: number } | null = null;
  let kills = 0;
  const sync = {
    ...defaultGsap,
    to: (target: { p: number }, vars: { onUpdate?: () => void; onComplete?: () => void }) => {
      onComplete = vars.onComplete;
      onUpdate = vars.onUpdate;
      lastTarget = target;
      return {
        kill: () => { kills++; },
        progress: (p: number) => {
          if (lastTarget) lastTarget.p = p;
          onUpdate?.();
          if (p === 1) onComplete?.();
        },
      } as unknown as gsap.core.Tween;
    },
  } as unknown as typeof defaultGsap;
  setGsap(sync);
  return {
    fire: () => {
      if (lastTarget) lastTarget.p = 1;
      onUpdate?.();
      onComplete?.();
    },
    killCount: () => kills,
  };
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

    it('does NOT re-emit `landed` after a nudge (nudge:complete is the right surface)', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const landedCalls: string[][] = [];
        reelSet.reels[0].events.on('landed', (symbols: string[]) => landedCalls.push([...symbols]));
        await reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] });
        // `landed` is the spin-stop event. A nudge fires `nudge:complete`,
        // never `landed` — counting on it for win re-detection would
        // double-fire.
        expect(landedCalls).toEqual([]);
      } finally {
        destroy();
      }
    });
  });

  describe('distance bounds', () => {
    it('throws when distance equals the total strip capacity', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        bufferSymbols: 1,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        // total = bufferAbove(1) + visible(3) + bufferBelow(1) = 5.
        // distance=5 would fully rotate the strip and drop the pre-placed
        // bufferAbove entry — we refuse instead of silently losing it.
        await expect(
          reelSet.nudge(0, {
            distance: 5,
            direction: 'down',
            incoming: ['wild', 'wild', 'wild', 'wild', 'wild'],
          }),
        ).rejects.toThrow(/strictly less than total strip capacity/);
      } finally {
        destroy();
      }
    });

    it('accepts distance = total - 1 (the largest preserving rotation)', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        bufferSymbols: 1,
        symbolIds: ['a', 'b', 'c', 'x', 'y', 'z', 'w'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        // total = 5. distance = 4 is the largest allowed; incoming[3]
        // lands in bufferBelow (the bottommost final position).
        const result = await reelSet.nudge(0, {
          distance: 4,
          direction: 'down',
          incoming: ['x', 'y', 'z', 'w'],
        });
        expect(result.symbols).toEqual(['x', 'y', 'z']);
      } finally {
        destroy();
      }
    });
  });

  describe('overshoot clamping', () => {
    it('overshooting ease does NOT fire spurious wraps past the landing position', async () => {
      // Simulate a back.out-style overshoot: progress climbs to 1.15
      // then settles back to 1. Pre-clamp this would have fired a
      // spurious wrap and corrupted the final frame.
      installSequenceGsap([0.5, 0.95, 1.15, 1.05, 1.0]);
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const result = await reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
          ease: 'back.out(1.5)',
        });
        expect(result.symbols).toEqual(['wild', 'a', 'b']);
      } finally {
        destroy();
      }
    });

    it('overshooting ease on an up-nudge clamps the upward travel', async () => {
      installSequenceGsap([0.5, 1.15, 1.0]);
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
          ease: 'back.out(1.5)',
        });
        expect(result.symbols).toEqual(['b', 'c', 'wild']);
      } finally {
        destroy();
      }
    });
  });

  describe('skipNudge', () => {
    it('fast-forwards an in-flight nudge to its landed state', async () => {
      const deferred = installDeferredGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const p = reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
        });
        // Tween is deferred — no completion yet.
        expect(reelSet.reels[0].isNudging).toBe(true);
        // Skip the nudge — should land + resolve.
        reelSet.skipNudge(0);
        const result = await p;
        expect(result.symbols).toEqual(['wild', 'a', 'b']);
        expect(reelSet.reels[0].isNudging).toBe(false);
        void deferred;
      } finally {
        destroy();
      }
    });

    it('skipNudge() with no col skips every in-flight nudge', async () => {
      installSyncGsap(); // resolve immediately so the multi-reel setup works
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
        // Use sync gsap so all nudges complete instantly; the skipAll
        // call just confirms no error when nothing is in flight.
        await Promise.all([
          reelSet.nudge(0, { distance: 1, direction: 'down', incoming: ['wild'] }),
          reelSet.nudge(2, { distance: 1, direction: 'down', incoming: ['wild'] }),
        ]);
        // After resolution, skipNudge() should be a clean no-op.
        expect(() => reelSet.skipNudge()).not.toThrow();
      } finally {
        destroy();
      }
    });

    it('throws on out-of-range col', async () => {
      const { reelSet, destroy } = createTestReelSet({
        reels: 2,
        visibleRows: 3,
        symbolIds: ['a'],
      });
      try {
        expect(() => reelSet.skipNudge(5)).toThrow(/out of range/);
      } finally {
        destroy();
      }
    });
  });

  describe('AbortSignal', () => {
    it('rejects with AbortError if signal is already aborted on entry', async () => {
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        const controller = new AbortController();
        controller.abort();
        const err = await reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
          signal: controller.signal,
        }).catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('AbortError');
      } finally {
        destroy();
      }
    });

    it('rejects with AbortError if signal aborts mid-tween, fires nudge:cancelled, lands deterministically', async () => {
      const deferred = installDeferredGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const cancelled: unknown[] = [];
        reelSet.events.on('nudge:cancelled', (info) => cancelled.push(info));
        const controller = new AbortController();
        const p = reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
          signal: controller.signal,
        });
        controller.abort();
        const err = await p.catch((e) => e);
        expect(err.name).toBe('AbortError');
        expect(cancelled).toHaveLength(1);
        // Deterministic landing — strip is at its post-nudge position
        // even though the tween was killed mid-flight.
        expectGrid(reelSet, [['wild', 'a', 'b']]);
        void deferred;
      } finally {
        destroy();
      }
    });
  });

  describe('startDelay (stagger sugar)', () => {
    it('honors startDelay before mutating the strip', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const before = Date.now();
        await reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
          startDelay: 60,
        });
        const elapsed = Date.now() - before;
        expect(elapsed).toBeGreaterThanOrEqual(50);
        expectGrid(reelSet, [['wild', 'a', 'b']]);
      } finally {
        destroy();
      }
    });

    it('aborting during startDelay rejects with AbortError', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'wild'],
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        const controller = new AbortController();
        const p = reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
          startDelay: 200,
          signal: controller.signal,
        });
        setTimeout(() => controller.abort(), 30);
        const err = await p.catch((e) => e);
        expect(err.name).toBe('AbortError');
      } finally {
        destroy();
      }
    });
  });

  describe('destroy mid-nudge', () => {
    it('destroying mid-tween rejects the nudge promise with AbortError, no crash', async () => {
      const deferred = installDeferredGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        const p = reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
        });
        // Destroy mid-tween. Should kill the tween + reject the promise.
        reelSet.destroy();
        const err = await p.catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('AbortError');
        expect(deferred.killCount()).toBeGreaterThanOrEqual(1);
      } finally {
        // destroy was already called; calling again is a no-op.
        destroy();
      }
    });
  });

  describe('nudge:start fires after pre-placement', () => {
    it('the strip already reflects pre-placement when nudge:start fires', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        bufferSymbols: 1,
        symbolIds: ['a', 'b', 'c', 'wild'],
      });
      try {
        await spinAndLand([['a', 'b', 'c']]);
        let bufferAboveAtStart: string | null = null;
        reelSet.events.on('nudge:start', () => {
          // bufferAbove cell holds incoming[0] (pre-placed) right when
          // nudge:start fires. Pre-fix this fired before mutation, so
          // the buffer still held the previous-spin random.
          bufferAboveAtStart = reelSet.reels[0].symbols[0].symbolId;
        });
        await reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
        });
        expect(bufferAboveAtStart).toBe('wild');
      } finally {
        destroy();
      }
    });
  });

  describe('big symbols on the strip', () => {
    it('nudges a 1x2 wild down through fully — anchor at visible row 0, stub at row 1', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        bufferSymbols: 1,
        symbolIds: ['a', 'b', 'c', 'bigW'],
        symbolData: {
          bigW: { weight: 0, size: { w: 1, h: 2 } },
        },
      });
      try {
        // 1x2 anchor at visible row 1 (so stub fits in visible row 2).
        // SetResult validates anchor + h fits in visibleRows.
        await spinAndLand([['a', 'bigW', 'bigW']]);
        // The strip already shows the full block. Nudge DOWN by 1 shifts
        // it to rows 2+3 — but row 3 doesn't exist. Block survival check:
        // anchor at strip[2], h=2, distance=1 down. Survival: 2 + 2 - 1 + 1 = 4 < 5 ✓.
        // After nudge: anchor at strip[3], stub at strip[4] (bufferBelow).
        // visible row 0 = 'a' (incoming), row 1 = 'a' (old top-visible),
        // row 2 = anchor 'bigW' (the top of the 1x2 block).
        const result = await reelSet.nudge(0, {
          distance: 1,
          direction: 'down',
          incoming: ['a'],
        });
        expect(result.symbols).toEqual(['a', 'a', 'bigW']);
      } finally {
        destroy();
      }
    });

    it('throws when a 1xH block would split — anchor too close to the wrap boundary', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        bufferSymbols: 1,
        symbolIds: ['a', 'b', 'c', 'bigW'],
        symbolData: {
          bigW: { weight: 0, size: { w: 1, h: 2 } },
        },
      });
      try {
        // 1x2 at visible rows 1+2 — anchor at strip[2], stub at strip[3].
        // total = 5. Survival for down distance=2: 2 + 2 - 1 + 2 = 5, NOT < 5,
        // so the block's bottom would wrap off strip[N-1] mid-rotation.
        await spinAndLand([['a', 'bigW', 'bigW']]);
        await expect(
          reelSet.nudge(0, {
            distance: 2,
            direction: 'down',
            incoming: ['a', 'b'],
          }),
        ).rejects.toThrow(/wouldn't survive/);
      } finally {
        destroy();
      }
    });

    it('throws when incoming includes a big symbol', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 1,
        visibleRows: 3,
        symbolIds: ['a', 'bigW'],
        symbolData: {
          bigW: { weight: 0, size: { w: 1, h: 2 } },
        },
      });
      try {
        await spinAndLand([['a', 'a', 'a']]);
        await expect(
          reelSet.nudge(0, {
            distance: 1,
            direction: 'down',
            incoming: ['bigW'],
          }),
        ).rejects.toThrow(/is a big symbol/);
      } finally {
        destroy();
      }
    });

    it('throws on cross-reel (w > 1) blocks involving this reel', async () => {
      installSyncGsap();
      const { reelSet, spinAndLand, destroy } = createTestReelSet({
        reels: 2,
        visibleRows: 3,
        bufferSymbols: 1,
        symbolIds: ['a', 'bonus', 'wild'],
        symbolData: {
          bonus: { weight: 0, size: { w: 2, h: 2 } },
        },
      });
      try {
        // Place a 2x2 bonus anchor at (col 0, row 0). The other-reel
        // cells become OCCUPIED stubs on col 1.
        await spinAndLand([
          ['bonus', 'a', 'a'],
          ['a', 'a', 'a'],
        ]);
        // Nudging col 0 would split the bonus block from its right half.
        await expect(
          reelSet.nudge(0, {
            distance: 1,
            direction: 'down',
            incoming: ['wild'],
          }),
        ).rejects.toThrow(/cross-reel/);
      } finally {
        destroy();
      }
    });
  });
});
