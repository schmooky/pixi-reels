/**
 * Tall big symbols (one reel wide, several cells high) in the random fill.
 *
 * A tall block with a weight > 0 streams past during the spin like any
 * other symbol: the strip feed places its anchor and OCCUPIED cells over
 * consecutive wraps, in the order the strip shows them. Single-slot draws
 * (`next()`) never return one, wide blocks never enter random fill at all,
 * and a block half-way onto the strip finishes before the stop frame starts.
 */
import { describe, it, expect, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import { RandomSymbolProvider } from '../../src/frame/RandomSymbolProvider.js';
import { OCCUPIED_SENTINEL } from '../../src/core/Reel.js';
import type { Reel } from '../../src/core/Reel.js';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const TALL = 3;

describe('RandomSymbolProvider: tall and wide blocks', () => {
  const data = {
    a: { weight: 1 },
    tall: { weight: 50, size: { reels: 1, cells: TALL } },
  };

  it('next() never returns a tall block; nextForStrip() does', () => {
    const provider = new RandomSymbolProvider(data);
    for (let i = 0; i < 500; i++) expect(provider.next('spinning', 0)).toBe('a');
    const drawn = new Set<string>();
    for (let i = 0; i < 500; i++) drawn.add(provider.nextForStrip(0));
    expect(drawn).toEqual(new Set(['a', 'tall']));
  });

  it('weights() still reports the tall weight', () => {
    const provider = new RandomSymbolProvider(data);
    expect(provider.weights({ reel: 0 })).toEqual({ a: 1, tall: 50 });
  });

  it('a per-reel pool admits a tall block on one reel only', () => {
    const provider = new RandomSymbolProvider({
      a: { weight: 1 },
      tall: { weight: 0, size: { reels: 1, cells: TALL } },
    });
    provider.set({ weights: { tall: 50 } }, { reel: 0 });
    const reel0 = new Set<string>();
    for (let i = 0; i < 500; i++) reel0.add(provider.nextForStrip(0));
    expect(reel0.has('tall')).toBe(true);
    for (let i = 0; i < 500; i++) expect(provider.nextForStrip(1)).toBe('a');
  });

  it('refuses a weight on a wide block, at construction and through a pool', () => {
    expect(
      () => new RandomSymbolProvider({ a: { weight: 1 }, wide: { weight: 5, size: { reels: 2, cells: 2 } } }),
    ).toThrow(/spans 2 reels and cannot be drawn at random/);
    const provider = new RandomSymbolProvider({
      a: { weight: 1 },
      wide: { weight: 0, size: { reels: 2, cells: 2 } },
    });
    expect(() => provider.set({ weights: { wide: 5 } }, { reel: 1 })).toThrow(
      /spans 2 reels and cannot be drawn at random/,
    );
    // The rejected pool was rolled back: the scope still draws normally.
    expect(provider.next('spinning', 1)).toBe('a');
  });

  it('a weight on a tall block needs bufferStart >= cells, at construction and through a pool', () => {
    expect(() => new RandomSymbolProvider(data, Math.random, { bufferStart: TALL - 1 })).toThrow(
      /cannot carry a weight on a set with bufferSymbols\(\{ start: 2 \}\)/,
    );
    expect(() => new RandomSymbolProvider(data, Math.random, { bufferStart: TALL })).not.toThrow();
    const provider = new RandomSymbolProvider(
      { a: { weight: 1 }, tall: { weight: 0, size: { reels: 1, cells: TALL } } },
      Math.random,
      { bufferStart: 1 },
    );
    expect(() => provider.set({ weights: { tall: 5 } }, { reel: 0 })).toThrow(/bufferSymbols\(\{ start: 1 \}\)/);
    expect(provider.nextForStrip(0)).toBe('a');
  });

  it('a pool that leaves only tall blocks drawable is rejected', () => {
    const provider = new RandomSymbolProvider(data);
    expect(() => provider.set({ weights: { a: 0 } })).toThrow(/Leave at least one 1x1 symbol drawable/);
  });
});

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

/** The feed queue, read through the private field for the assertions below. */
function pendingFeed(reel: Reel): string[] {
  return (reel as unknown as { _feedQueue: string[] })._feedQueue;
}

/**
 * Every OCCUPIED cell on the strip belongs to a tall anchor within `TALL - 1`
 * slots before it, and every tall anchor is followed by stubs up to the end
 * of its block or the end of the strip. The one exception is a run of stubs
 * from the start edge, which is a block without its anchor on the strip:
 *
 *   - forward: a block still entering. The run is exactly what the queue has
 *     not placed yet, and without a queue there is no such run at all;
 *   - reverse: a block whose anchor has wrapped out, shorter than a block.
 *     A block entering at the end edge may be in the queue at the same time,
 *     and then its anchor sits `TALL - queue.length` cells from the end.
 */
function expectStripConsistent(reel: Reel, direction: 'forward' | 'reverse'): void {
  const ids = reel.symbols.map((s) => s.symbolId);
  const queue = pendingFeed(reel);
  const where = `strip ${ids.join(',')} queue ${queue.join(',')}`;
  let edgeRun = 0;
  while (edgeRun < ids.length && ids[edgeRun] === OCCUPIED_SENTINEL) edgeRun++;
  expect(edgeRun, `${where}: edge run longer than a block`).toBeLessThan(TALL);
  if (direction === 'forward') {
    expect(edgeRun, `${where}: forward edge run does not match the queue`).toBe(
      queue.length === 0 ? 0 : TALL - queue.length,
    );
  } else if (queue.length > 0) {
    expect(ids[ids.length - (TALL - queue.length)], `${where}: entering block has no anchor`).toBe('tall');
  }
  for (let i = edgeRun; i < ids.length; i++) {
    if (ids[i] === 'tall') {
      for (let dy = 1; dy < TALL && i + dy < ids.length; dy++) {
        expect(ids[i + dy], `${where}: cell ${i + dy} under anchor ${i}`).toBe(OCCUPIED_SENTINEL);
      }
      continue;
    }
    if (ids[i] !== OCCUPIED_SENTINEL) continue;
    let j = i - 1;
    while (j >= 0 && ids[j] === OCCUPIED_SENTINEL) j--;
    expect(ids[j], `${where}: stub ${i} owned by ${ids[j]} at ${j}`).toBe('tall');
    expect(i - j, `${where}: stub ${i} too far from anchor ${j}`).toBeLessThan(TALL);
  }
}

/** No block piece anywhere: the strip holds 1x1 symbols only. */
function expectNoBlockPieces(reel: Reel): void {
  const ids = reel.symbols.map((s) => s.symbolId);
  expect(ids).not.toContain(OCCUPIED_SENTINEL);
  expect(ids).not.toContain('tall');
}

/** Tick until the feed queue is non-empty, so a block is half-way onto the strip. */
async function tickUntilMidFeed(h: ReturnType<typeof makeHarness>, reel: Reel): Promise<void> {
  for (let i = 0; i < 2000; i++) {
    h.ticker.tick(16);
    await Promise.resolve();
    if (pendingFeed(reel).length > 0) return;
  }
  throw new Error('no block started within 2000 frames');
}

const GSAP_KEYS = new Set(['duration', 'ease', 'delay', 'onUpdate', 'onComplete', 'onStart', 'overwrite']);

/**
 * A gsap whose tweens finish inline: every numeric target property jumps to
 * its end value and the callbacks fire at once. The start phase accelerates
 * through a tween, and nothing drives real gsap under the FakeTicker.
 */
const syncGsap = {
  ...defaultGsap,
  to: (target: Record<string, unknown>, vars: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(vars)) {
      if (!GSAP_KEYS.has(key)) target[key] = value;
    }
    (vars.onUpdate as (() => void) | undefined)?.();
    (vars.onComplete as (() => void) | undefined)?.();
    return { kill: vi.fn(), progress: vi.fn() } as unknown as gsap.core.Tween;
  },
} as unknown as typeof defaultGsap;

function makeHarness(direction: 'forward' | 'reverse') {
  const h = createTestReelSet({
    reels: 2,
    visibleCells: 3,
    symbolIds: ['a', 'b', 'tall'],
    weights: { a: 1, b: 1 },
    symbolData: { tall: { weight: 40, size: { reels: 1, cells: TALL } } },
    bufferSymbols: { start: TALL, end: 1 },
    direction,
    gsap: syncGsap,
  });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.setSpeed(FAST.name);
  return h;
}

describe.each(['forward', 'reverse'] as const)('tall blocks stream past during a %s spin', (direction) => {
  it('keeps every block whole on the strip and lands the frame intact', async () => {
    const h = makeHarness(direction);
    try {
      const reel = h.reelSet.reels[0];
      const tallsSeen = new Set<number>();
      let resolved = false;
      const spin = h.reelSet.spin().then(() => {
        resolved = true;
      });

      // Spin freely: the strip must stay consistent on every frame, the
      // tall block must show up, and every anchor seen must be at its full
      // block height while in motion.
      const anchorHeights = new Set<number>();
      for (let i = 0; i < 400; i++) {
        h.ticker.tick(16);
        await Promise.resolve();
        expectStripConsistent(reel, direction);
        reel.symbols.forEach((s, idx) => {
          if (s.symbolId !== 'tall') return;
          tallsSeen.add(idx);
          anchorHeights.add((s as unknown as { height: number }).height);
        });
      }
      expect(tallsSeen.size).toBeGreaterThan(0);
      expect([...anchorHeights]).toEqual([100 * TALL]);

      // Land from the middle of a block: the feed finishes it before the
      // stop frame starts, so the strip stays consistent and the frame lands
      // exact.
      await tickUntilMidFeed(h, reel);
      const grid: ColumnTarget[] = [{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'a', 'b'] }];
      h.reelSet.setResult(grid);
      for (let i = 0; i < 2000 && !resolved; i++) {
        h.ticker.tick(16);
        await Promise.resolve();
        expectStripConsistent(reel, direction);
      }
      await spin;
      expect(resolved).toBe(true);
      expect(h.reelSet.getVisibleGrid()).toEqual([
        ['a', 'b', 'a'],
        ['b', 'a', 'b'],
      ]);
      // Nothing of a random block survives the landing, buffers included.
      for (const r of h.reelSet.reels) expectNoBlockPieces(r);
      expect(pendingFeed(reel)).toEqual([]);
    } finally {
      h.destroy();
    }
  });

  it('never starts a block once the stop frame is exhausted', () => {
    const h = makeHarness(direction);
    try {
      const reel = h.reelSet.reels[0];
      // The state after the last frame symbol wrapped in and before the
      // phase lands: stopping, nothing left in the sequencer. Any wrap that
      // slips in here must draw one cell, or the landing cuts a block.
      reel.isStopping = true;
      const before = reel.symbols.map((s) => s.symbolId);
      expect(before).not.toContain('tall');
      for (let i = 0; i < 300; i++) reel.motion.advance(reel.motion.slotPitch);
      expectNoBlockPieces(reel);
      expect(pendingFeed(reel)).toEqual([]);
    } finally {
      h.destroy();
    }
  });

  it('a slam in the middle of a block lands the frame with no block piece left', async () => {
    const h = makeHarness(direction);
    try {
      const reel = h.reelSet.reels[0];
      const spin = h.reelSet.spin();
      await tickUntilMidFeed(h, reel);
      h.reelSet.setResult([{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'a', 'b'] }]);
      h.reelSet.slamStop();
      await spin;
      expect(h.reelSet.getVisibleGrid()).toEqual([
        ['a', 'b', 'a'],
        ['b', 'a', 'b'],
      ]);
      for (const r of h.reelSet.reels) expectNoBlockPieces(r);
      expect(pendingFeed(reel)).toEqual([]);
    } finally {
      h.destroy();
    }
  });

  it('an abort in the middle of a block rests on a clean strip', async () => {
    const h = makeHarness(direction);
    try {
      const reel = h.reelSet.reels[0];
      const controller = new AbortController();
      const spin = h.reelSet.spin({ signal: controller.signal });
      await tickUntilMidFeed(h, reel);
      controller.abort();
      await expect(spin).rejects.toThrow();
      // No result ever came, so the strip snapped where it was. The placed
      // cells of the unfinished block were replaced with single cells, and
      // every stub left is under an anchor.
      expect(pendingFeed(reel)).toEqual([]);
      expectStripConsistent(reel, direction);
      const ids = reel.symbols.map((s) => s.symbolId);
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] !== OCCUPIED_SENTINEL) continue;
        const owner = ids.slice(Math.max(0, i - TALL + 1), i).lastIndexOf('tall');
        expect(owner, `stub at ${i} of ${ids.join(',')} has no anchor`).toBeGreaterThanOrEqual(0);
      }
    } finally {
      h.destroy();
    }
  });
});

describe('builder guard', () => {
  it('accepts a tall block with a weight once bufferStart covers it, and still rejects a wide one', () => {
    const tall = { weight: 5, size: { reels: 1, cells: 2 } };
    expect(() =>
      createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'tall'], symbolData: { tall } }),
    ).toThrow(/bufferSymbols\(\{ start: 1 \}\)/);
    const ok = createTestReelSet({
      reels: 3,
      visibleCells: 3,
      symbolIds: ['a', 'tall'],
      symbolData: { tall },
      bufferSymbols: { start: 2, end: 1 },
    });
    ok.destroy();
    expect(() =>
      createTestReelSet({
        reels: 3,
        visibleCells: 3,
        symbolIds: ['a', 'wide'],
        symbolData: { wide: { weight: 5, size: { reels: 2, cells: 1 } } },
      }),
    ).toThrow(/must have weight 0/);
  });
});
