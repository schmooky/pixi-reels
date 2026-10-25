/**
 * A weighted tall block on a set that spins on `StaticSpinSymbol` snapshots.
 * The anchor is placed at its block size, so the cache captures the tall id
 * once at that size and never at one cell, and the spin lands clean.
 */
import type { Ticker } from 'pixi.js';
import { RenderTexture, type Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return {
    ...actual,
    BlurFilter: class {
      constructor(_options?: unknown) {}
    },
  };
});
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { OCCUPIED_SENTINEL } from '../../src/core/Reel.js';
import { SpinTextureCache, type SnapshotRenderer } from '../../src/snapshot/SpinTextureCache.js';
import { StaticSpinSymbol } from '../../src/snapshot/StaticSpinSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { SpeedProfile } from '../../src/config/types.js';

const TALL = 3;
const CELL = { width: 120, height: 100 };

const FAST: SpeedProfile = {
  name: 'normal',
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

const GSAP_KEYS = new Set(['duration', 'ease', 'delay', 'onUpdate', 'onComplete', 'onStart', 'overwrite']);
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

describe('tall blocks on StaticSpinSymbol', () => {
  it('captures the tall id once per block size, never at one cell, and lands clean', async () => {
    const captures: Array<{ width: number; height: number }> = [];
    const renderer: SnapshotRenderer = {
      generateTexture: vi.fn((options: { frame?: { width: number; height: number } }): Texture => {
        captures.push({ width: options.frame?.width ?? 0, height: options.frame?.height ?? 0 });
        return RenderTexture.create({
          width: Math.max(1, options.frame?.width ?? 10),
          height: Math.max(1, options.frame?.height ?? 10),
        });
      }),
    };
    const cache = new SpinTextureCache({ renderer });
    const ticker = new FakeTicker();
    const register = (id: string) =>
      ({ createInner: () => new HeadlessSymbol(), cache, show: 'static' as const });
    const reelSet = new ReelSetBuilder()
      .reels(2)
      .visibleCells(3)
      .bufferSymbols({ start: TALL, end: 1 })
      .symbolSize(CELL.width, CELL.height)
      .ticker(ticker as unknown as Ticker)
      .gsap(syncGsap)
      .symbols((r) => {
        r.register('a', StaticSpinSymbol, register('a'));
        r.register('b', StaticSpinSymbol, register('b'));
        r.register('tall', StaticSpinSymbol, register('tall'));
      })
      .weights({ a: 1, b: 1 })
      .symbolData({ tall: { weight: 40, size: { reels: 1, cells: TALL } } })
      .speed(FAST.name, FAST)
      .build();
    try {
      const reel = reelSet.reels[0];
      let resolved = false;
      const spin = reelSet.spin().then(() => {
        resolved = true;
      });
      let sawTall = false;
      for (let i = 0; i < 400; i++) {
        ticker.tick(16);
        await Promise.resolve();
        for (const s of reel.symbols) {
          if (s.symbolId !== 'tall') continue;
          sawTall = true;
          const sym = s as StaticSpinSymbol & { _cellW: number; _cellH: number };
          expect(sym.isShowingSnapshot).toBe(true);
          expect(sym._cellW).toBe(CELL.width);
          expect(sym._cellH).toBe(CELL.height * TALL);
        }
      }
      expect(sawTall).toBe(true);
      // `captures` records every generateTexture call; the cache keys them by
      // id and size, so the tall id's captures are the ones at block height.
      const tallCaptures = captures.filter((c) => c.height === CELL.height * TALL);
      expect(tallCaptures.length).toBeGreaterThan(0);
      expect(cache.getStatic('tall', CELL.width, CELL.height * TALL)).not.toBeNull();
      expect(cache.getStatic('tall', CELL.width, CELL.height)).toBeNull();

      reelSet.setResult([{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'a', 'b'] }]);
      for (let i = 0; i < 2000 && !resolved; i++) {
        ticker.tick(16);
        await Promise.resolve();
      }
      await spin;
      expect(reelSet.getVisibleGrid()).toEqual([
        ['a', 'b', 'a'],
        ['b', 'a', 'b'],
      ]);
      for (const r of reelSet.reels) {
        const ids = r.symbols.map((s) => s.symbolId);
        expect(ids).not.toContain(OCCUPIED_SENTINEL);
        expect(ids).not.toContain('tall');
      }
    } finally {
      reelSet.destroy();
      cache.destroy();
      ticker.destroy();
    }
  });
});
