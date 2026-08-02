import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { ReelSet } from '../../src/index.js';

/**
 * `bufferSymbols({ start, end: 0 })`. tumble-only reel sets with no
 * below-window buffer. A pure tumble never scrolls the strip, so the
 * below cells exist only to be hidden by the mask; dropping them means
 * nothing can ever peek out under the window. Strip spins and nudges
 * (which wrap/shift symbols through that buffer) throw instead.
 */
function buildTumbleBelowZero(initialFrame: string[][]): {
  reelSet: ReelSet;
  destroy: () => void;
} {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(initialFrame.length)
    .visibleCells(initialFrame[0].length)
    .symbolSize(50, 50)
    .bufferSymbols({ start: 1, end: 0 })
    .symbols((r) => {
      for (const id of ['a', 'b', 'x']) r.register(id, HeadlessSymbol, {});
    })
    .weights({ a: 1, b: 1 })
    .tumble({
      fall:   { duration: 0, ease: 'none', cellStagger: 0 },
      dropIn: { duration: 0, ease: 'none', cellStagger: 0, distance: 'perHole' },
    })
    .initialFrame(initialFrame.map((visible) => ({ visible })))
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, destroy: () => { reelSet.destroy(); ticker.destroy(); } };
}

describe('bufferSymbols({ end: 0 }). tumble-only reel sets', () => {
  it('builds with no below-window strip cells', () => {
    const h = buildTumbleBelowZero([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      for (const reel of h.reelSet.reels) {
        expect(reel.bufferStart).toBe(1);
        expect(reel.bufferEnd).toBe(0);
        // strip = bufferStart + visible cells, nothing below.
        expect(reel.symbols.length).toBe(1 + 3);
      }
    } finally {
      h.destroy();
    }
  });

  it('requires .tumble(...): build() throws without it', () => {
    const ticker = new FakeTicker();
    const builder = new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(50, 50)
      .bufferSymbols({ start: 1, end: 0 })
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .ticker(ticker as unknown as Ticker);
    try {
      expect(() => builder.build()).toThrow(/tumble-only/);
    } finally {
      ticker.destroy();
    }
  });

  it('number form keeps the legacy clamp (0 -> 1, both sides)', () => {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(2)
      .visibleCells(3)
      .symbolSize(50, 50)
      .bufferSymbols(0)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .ticker(ticker as unknown as Ticker)
      .build();
    try {
      expect(reelSet.reels[0].bufferStart).toBe(1);
      expect(reelSet.reels[0].bufferEnd).toBe(1);
    } finally {
      reelSet.destroy();
      ticker.destroy();
    }
  });

  it('runs a full destroy + refill + runCascade cycle', async () => {
    const h = buildTumbleBelowZero([
      ['a', 'a', 'a'],
      ['x', 'a', 'b'],
      ['a', 'a', 'a'],
    ]);
    try {
      let ran = false;
      const result = await h.reelSet.runCascade({
        detectWinners: () => {
          if (ran) return [];
          ran = true;
          return [{ reel: 1, cell: 0 }];
        },
        nextGrid: (prev) => prev.map((reel, c) => ({
          visible: c === 1 ? ['b', ...reel.slice(1)] : [...reel],
        })),
        pauseAfterDestroyMs: 0,
      });
      expect(result.chainLength).toBe(1);
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['b', 'a', 'b']);
    } finally {
      h.destroy();
    }
  });

  it('rejects strip spins and nudges', async () => {
    const h = buildTumbleBelowZero([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      await expect(h.reelSet.spin({ mode: 'standard' })).rejects.toThrow(/bufferEnd >= 1/);
      await expect(
        h.reelSet.nudge(0, { direction: 'forward', count: 1 } as never),
      ).rejects.toThrow(/bufferEnd >= 1/);
    } finally {
      h.destroy();
    }
  });
});
