import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { ReelSet } from '../../src/index.js';

function buildTumbleHarness(initialFrame: string[][]): {
  reelSet: ReelSet;
  destroy: () => void;
} {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(initialFrame.length)
    .visibleCells(initialFrame[0].length)
    .symbolSize(50, 50)
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
  return {
    reelSet,
    destroy: () => { reelSet.destroy(); ticker.destroy(); },
  };
}

describe('runCascade. presentWinners pre-destroy hook', () => {
  it('awaits presentWinners BEFORE destroySymbols, then onCascade after', async () => {
    const h = buildTumbleHarness([
      ['x', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      const order: string[] = [];
      let alphaDuringPresent = -1;
      let alphaDuringOnCascade = -1;
      const winnerView = () => h.reelSet.reels[0].getSymbolAt(0).view;

      let ran = false;
      await h.reelSet.runCascade({
        detectWinners: () => {
          if (ran) return [];
          ran = true;
          return [{ reel: 0, cell: 0 }];
        },
        nextGrid: (prev) => prev.map((reel, c) =>
          c === 0 ? ['b', ...reel.slice(1)] : [...reel],
        ),
        presentWinners: async ({ winners }) => {
          order.push('present');
          expect(winners).toEqual([{ reel: 0, cell: 0 }]);
          // The winner must still be ON the board during presentation.
          alphaDuringPresent = winnerView().alpha;
        },
        onCascade: async () => {
          order.push('onCascade');
          // By the post-destroy hook, the winner is visually gone.
          alphaDuringOnCascade = winnerView().alpha;
        },
        pauseAfterDestroyMs: 0,
      });

      expect(order).toEqual(['present', 'onCascade']);
      expect(alphaDuringPresent).toBe(1);
      expect(alphaDuringOnCascade).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('runs once per chain stage, before each destroy', async () => {
    const h = buildTumbleHarness([
      ['x', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      const order: string[] = [];
      let stagesLeft = 2;
      await h.reelSet.runCascade({
        detectWinners: () => {
          if (stagesLeft === 0) return [];
          stagesLeft -= 1;
          return [{ reel: 0, cell: 0 }];
        },
        nextGrid: (prev) => prev.map((reel, c) =>
          c === 0 ? ['x', ...reel.slice(1)] : [...reel],
        ),
        presentWinners: ({ chain }) => { order.push(`present:${chain}`); },
        onCascade: ({ chain }) => { order.push(`after:${chain}`); },
        pauseAfterDestroyMs: 0,
      });
      expect(order).toEqual(['present:1', 'after:1', 'present:2', 'after:2']);
    } finally {
      h.destroy();
    }
  });
});
