/**
 * SpinMetrics: the round recorder behind the `metrics` and `timeline`
 * overlay layers and `__PIXI_REELS_DEBUG.metrics()`. It is only worth having
 * if its times are right, so these drive it on a fake clock.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { SpinMetrics } from '../../src/debug/SpinMetrics.js';

const grid = (reels: number) => Array.from({ length: reels }, () => ({ visible: ['a', 'b', 'c'] }));

describe('SpinMetrics', () => {
  it('records a whole spin as one round', async () => {
    let now = 1000;
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet, { now: () => now });
    try {
      expect(metrics.current).toBeNull();

      const promise = h.reelSet.spin();
      now += 120;
      h.advance(120);
      h.reelSet.setResult(grid(3));
      now += 30;
      h.reelSet.slamStop();
      const result = await promise;

      const round = metrics.current!;
      expect(round.index).toBe(1);
      expect(round.spin).toBe(true);
      expect(round.startedAt).toBe(1000);
      expect(round.completeAt).toBe(150);
      expect(round.duration).toBe(result.duration);
      expect(round.wasSkipped).toBe(result.wasSkipped);
      expect([...round.landOrder].sort()).toEqual([0, 1, 2]);
      for (const reel of round.reels) {
        // Every phase that started also ended: nothing is left dangling.
        expect(reel.phases.length).toBeGreaterThan(0);
        expect(reel.phases.every((p) => p.end !== null)).toBe(true);
        expect(reel.landedAt).toBe(150);
      }
      // The slam is a skip press the round saw.
      expect(round.skips.map((s) => s.mode)).toContain('slam');
      expect(round.events).toBeGreaterThan(10);
      expect(metrics.isActive).toBe(false);
      expect(metrics.length).toBe(150);
    } finally {
      metrics.destroy();
      h.destroy();
    }
  });

  it('keeps tease windows, stop requests, landing order and skip completion', () => {
    let now = 0;
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet, { now: () => now });
    const set = h.reelSet.events;
    const reel = (i: number) => h.reelSet.reels[i].events;
    try {
      set.emit('spin:start');
      now = 10;
      for (let i = 0; i < 3; i++) reel(i).emit('phase:enter', 'spin');
      now = 400;
      set.emit('spin:stopping', 1);
      set.emit('spin:stopping', 0);
      now = 500;
      set.emit('anticipation:reel', { reelIndex: 2, order: 0, total: 1 });
      set.emit('skip:requested', { mode: 'quicken', reels: [2], partial: false });
      now = 650;
      reel(1).emit('phase:exit', 'spin');
      set.emit('spin:reelLanded', 1, ['a', 'b', 'c']);
      now = 700;
      reel(0).emit('phase:exit', 'spin');
      set.emit('spin:reelLanded', 0, ['a', 'b', 'c']);
      now = 900;
      set.emit('anticipation:reelEnd', { reelIndex: 2 });
      set.emit('spin:reelLanded', 2, ['a', 'b', 'c']);
      set.emit('skip:completed', { mode: 'quicken', reels: [2], partial: false });

      const round = metrics.current!;
      expect(round.reels[1].stoppingAt).toBe(400);
      expect(round.reels[0].phases).toEqual([{ phase: 'spin', start: 10, end: 700 }]);
      // The phase on reel 2 never exited, so it is still open - the timeline
      // draws it to "now" and the round counts as active.
      expect(round.reels[2].phases[0].end).toBeNull();
      expect(metrics.isActive).toBe(true);
      expect(round.reels[2].tease).toEqual({ start: 500, end: 900, order: 0, total: 1 });
      expect(round.landOrder).toEqual([1, 0, 2]);
      expect(round.skips).toEqual([
        { at: 500, mode: 'quicken', reels: [2], partial: false, completedAt: 900 },
      ]);
    } finally {
      metrics.destroy();
      h.destroy();
    }
  });

  it('opens a fresh round per spin:start and keeps only the last `history`', async () => {
    const h = createTestReelSet({ reels: 2, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet, { history: 2 });
    try {
      for (let i = 0; i < 3; i++) await h.spinAndLand(grid(2));
      expect(metrics.rounds.map((r) => r.index)).toEqual([2, 3]);
      expect(metrics.totals.rounds).toBe(3);
      expect(metrics.totals.averageDuration).not.toBeNull();
    } finally {
      metrics.destroy();
      h.destroy();
    }
  });

  it('samples speed on the ticker only while a round runs', () => {
    let now = 0;
    const h = createTestReelSet({ reels: 2, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet, {
      now: () => now,
      ticker: h.ticker as unknown as Ticker,
      sampleMs: 0,
    });
    const tick = (ms: number) => {
      now += ms;
      h.advance(ms, ms);
    };
    try {
      tick(16);
      expect(metrics.current).toBeNull();

      void h.reelSet.spin().catch(() => undefined);
      for (let i = 0; i < 20; i++) tick(16);
      const trace = metrics.current!.reels[0].speed;
      // [t, v] pairs, one per tick since the spin started. The values are
      // whatever `speedNormalized` read: the start phase's ease runs on gsap's
      // own clock, which this fake ticker does not drive.
      expect(trace.length).toBe(40);
      expect(trace.every(Number.isFinite)).toBe(true);
      expect(trace[2] - trace[0]).toBe(16);

      h.reelSet.setResult(grid(2));
      h.reelSet.slamStop();
      const settled = metrics.current!.reels[0].speed.length;
      tick(16);
      tick(16);
      expect(metrics.current!.reels[0].speed.length).toBe(settled);
    } finally {
      metrics.destroy();
      h.destroy();
    }
  });

  it('snapshots as plain JSON that later rounds do not mutate', async () => {
    const h = createTestReelSet({ reels: 2, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet);
    try {
      await h.spinAndLand(grid(2));
      const snap = metrics.snapshot();
      expect(() => JSON.stringify(snap)).not.toThrow();
      await h.spinAndLand(grid(2));
      expect(snap.rounds).toHaveLength(1);
      expect(metrics.rounds).toHaveLength(2);
    } finally {
      metrics.destroy();
      h.destroy();
    }
  });

  it('lets go of the buses when the reel set is destroyed', () => {
    const h = createTestReelSet({ reels: 2, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet, { ticker: h.ticker as unknown as Ticker });
    h.destroy();
    expect(metrics.isDestroyed).toBe(true);
    expect(() => h.advance(32)).not.toThrow();
  });
});

describe('SpinMetrics on a growing board', () => {
  it('records the phases of reels added after it was created', async () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(h.reelSet);
    try {
      h.reelSet.addReels(2);
      const result = await h.reelSet.expand({ columns: [{ visible: ['a', 'a', 'a'] }], signal: AbortSignal.abort() });
      expect(result.reelCount).toBe(6);
      const round = metrics.current!;
      expect(round.reels).toHaveLength(6);
      expect(round.reels[5].phases.length).toBeGreaterThan(0);
      expect(round.landOrder).toEqual([5]);
    } finally {
      metrics.destroy();
      h.destroy();
    }
  });
});
