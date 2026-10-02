/**
 * MultiWays + StaticSpinSymbol + one shared SpinTextureCache: the setup that
 * crashed the presentation build. Every reel sizes the same id differently,
 * and the cache used to keep one capture per id, so each reel's capture at
 * its own size destroyed the texture another reel was spinning on.
 *
 * Runs whole spins (and an expansion) on a real reel set and checks that no
 * snapshot sprite anywhere on the board ever points at a destroyed texture.
 */
import { RenderTexture, Sprite, type Texture, type Ticker } from 'pixi.js';
import { describe, it, expect, vi } from 'vitest';

// A real BlurFilter compiles a GL program; tests run in node.
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
import { SpinTextureCache, type SnapshotRenderer } from '../../src/snapshot/SpinTextureCache.js';
import { StaticSpinSymbol } from '../../src/snapshot/StaticSpinSymbol.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { ReelSet } from '../../src/core/ReelSet.js';

const IDS = ['a', 'b', 'c', 'd'];

function build() {
  const renderer: SnapshotRenderer = {
    generateTexture: (options: { frame?: { width: number; height: number } }): Texture =>
      RenderTexture.create({
        width: Math.max(1, options.frame?.width ?? 10),
        height: Math.max(1, options.frame?.height ?? 10),
      }),
  };
  const cache = new SpinTextureCache({ renderer });
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(5)
    .multiways({ minCells: 2, maxCells: 7, reelExtent: 700 })
    .symbolSize(100, 100)
    .symbols((r) => {
      for (const id of IDS) r.register(id, StaticSpinSymbol, { createInner: () => new HeadlessSymbol(), cache });
    })
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, cache, ticker };
}

/** Every snapshot texture any symbol on the board currently draws with. */
function snapshotTextures(reelSet: ReelSet): Texture[] {
  const out: Texture[] = [];
  for (const reel of reelSet.reels) {
    for (const symbol of reel.symbols) {
      for (const child of symbol.view.children) {
        if (child instanceof Sprite && child.texture.width > 1) out.push(child.texture);
      }
    }
  }
  return out;
}

const column = (cells: number, id: string) => ({ visible: Array.from({ length: cells }, () => id) });

describe('MultiWays on StaticSpinSymbol with one shared cache', () => {
  it('reels of different shapes spin and land without drawing a destroyed texture', async () => {
    const { reelSet, cache, ticker } = build();
    const shapes = [
      [7, 2, 5, 3, 7],
      [2, 7, 7, 4, 2],
      [3, 3, 6, 7, 5],
    ];
    for (const shape of shapes) {
      const spin = reelSet.spin();
      ticker.tickFor(200);
      // Mid-spin, every reel shows snapshots of ITS cell size.
      expect(snapshotTextures(reelSet).every((t) => !t.destroyed)).toBe(true);
      reelSet.setShape(shape);
      reelSet.setResult(shape.map((n, i) => column(n, IDS[i % IDS.length])));
      ticker.tickFor(100);
      expect(snapshotTextures(reelSet).every((t) => !t.destroyed)).toBe(true);
      reelSet.slamStop();
      await spin;
      expect(reelSet.reels.map((r) => r.visibleCells)).toEqual(shape);
    }
    reelSet.destroy();
    cache.destroy();
    ticker.destroy();
  });

  it('an expansion adds reels that capture at their own size, leaving the board intact', async () => {
    const { reelSet, cache, ticker } = build();
    const spin = reelSet.spin();
    reelSet.setShape([7, 7, 7, 7, 7]);
    reelSet.setResult(Array.from({ length: 5 }, () => column(7, 'a')));
    reelSet.slamStop();
    await spin;

    const result = await reelSet.expand({
      columns: [column(2, 'b'), column(5, 'c')],
      signal: AbortSignal.abort(),
    });
    expect(result.reelCount).toBe(7);
    expect(reelSet.reels.map((r) => r.visibleCells)).toEqual([7, 7, 7, 7, 7, 2, 5]);

    // And the next full spin on the grown board is still clean.
    const again = reelSet.spin();
    ticker.tickFor(200);
    expect(snapshotTextures(reelSet).every((t) => !t.destroyed)).toBe(true);
    reelSet.setShape([2, 3, 4, 5, 6, 7, 2]);
    reelSet.setResult([2, 3, 4, 5, 6, 7, 2].map((n) => column(n, 'd')));
    reelSet.slamStop();
    await again;
    reelSet.destroy();
    cache.destroy();
    ticker.destroy();
  });
});
