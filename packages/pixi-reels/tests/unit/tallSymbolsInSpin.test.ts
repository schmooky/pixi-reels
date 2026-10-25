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

/**
 * Every OCCUPIED cell on the strip belongs to a tall anchor within `TALL - 1`
 * slots before it, or sits in a run of stubs that reaches the start edge
 * (its anchor has wrapped out, or is still to come at the start edge).
 * Every tall anchor is followed by stubs up to the end of its block or the
 * end of the strip.
 */
function expectStripConsistent(reel: Reel): void {
  const ids = reel.symbols.map((s) => s.symbolId);
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === 'tall') {
      for (let dy = 1; dy < TALL && i + dy < ids.length; dy++) {
        expect(ids[i + dy], `strip ${ids.join(',')}: cell ${i + dy} under anchor ${i}`).toBe(OCCUPIED_SENTINEL);
      }
      continue;
    }
    if (ids[i] !== OCCUPIED_SENTINEL) continue;
    let j = i - 1;
    while (j >= 0 && ids[j] === OCCUPIED_SENTINEL) j--;
    if (j < 0) continue; // run reaches the start edge
    expect(ids[j], `strip ${ids.join(',')}: stub ${i} owned by ${ids[j]} at ${j}`).toBe('tall');
    expect(i - j, `strip ${ids.join(',')}: stub ${i} too far from anchor ${j}`).toBeLessThan(TALL);
  }
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

      // Spin freely: the strip must stay consistent on every frame, and the
      // tall block must actually show up.
      for (let i = 0; i < 400; i++) {
        h.ticker.tick(16);
        await Promise.resolve();
        expectStripConsistent(reel);
        reel.symbols.forEach((s, idx) => {
          if (s.symbolId === 'tall') tallsSeen.add(idx);
        });
      }
      expect(tallsSeen.size).toBeGreaterThan(0);

      // The tall anchor scrolls at its full block height while in motion.
      const anchor = reel.symbols.find((s) => s.symbolId === 'tall') as unknown as
        | { height: number }
        | undefined;
      if (anchor) expect(anchor.height).toBe(100 * TALL);

      const grid: ColumnTarget[] = [{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'a', 'b'] }];
      h.reelSet.setResult(grid);
      for (let i = 0; i < 2000 && !resolved; i++) {
        h.ticker.tick(16);
        await Promise.resolve();
        expectStripConsistent(reel);
      }
      await spin;
      expect(resolved).toBe(true);
      expect(h.reelSet.getVisibleGrid()).toEqual([
        ['a', 'b', 'a'],
        ['b', 'a', 'b'],
      ]);
      // Nothing of a random block survives the landing, buffers included.
      for (const r of h.reelSet.reels) {
        expect(r.symbols.map((s) => s.symbolId)).not.toContain(OCCUPIED_SENTINEL);
        expect(r.symbols.map((s) => s.symbolId)).not.toContain('tall');
      }
    } finally {
      h.destroy();
    }
  });
});

describe('builder guard', () => {
  it('accepts a tall block with a weight and still rejects a wide one', () => {
    const ok = createTestReelSet({
      reels: 3,
      visibleCells: 3,
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 5, size: { reels: 1, cells: 2 } } },
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
