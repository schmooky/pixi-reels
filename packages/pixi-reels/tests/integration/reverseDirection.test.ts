/**
 * Per-reel travel direction (A9 + section 6.1). Reverse vertical reels reuse the
 * exact vertical geometry and flip the axis polarity; they spin and land through
 * the same lifecycle as forward reels because the StopSequencer feed edge is now
 * direction-aware. This exercises the polarity path (ReelMotion derive, Reel
 * writes, Start/Stop bounce, head-first stop feed) the forward-only suite never
 * touches. Horizontal still fails loud (its set geometry lands later).
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

function forwardBuilder() {
  return new ReelSetBuilder()
    .reels(3)
    .visibleRows(3)
    .symbolSize(100, 100)
    .ticker(new FakeTicker() as unknown as Ticker)
    .symbols((r) => r.register('a', HeadlessSymbol, {}));
}

describe('reverse + per-reel direction', () => {
  it('a reverse (roll-up) vertical set spins and lands the requested grid', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'b', 'c', 'd', 'e'],
      direction: 'reverse',
    });
    try {
      const grid = [
        ['a', 'b', 'c'],
        ['b', 'c', 'd'],
        ['c', 'd', 'e'],
      ];
      await h.spinAndLand(grid);
      expect(h.reelSet.getVisibleGrid()).toEqual(grid);
      expect(h.reelSet.reels[0].axis.direction).toBe('reverse');
      expect(h.reelSet.reels[0].axis.polarity).toBe(-1);
    } finally {
      h.destroy();
    }
  });

  it('directionPerReel lands correctly with alternating columns', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'b', 'c', 'd'],
      directionPerReel: ['forward', 'reverse', 'forward'],
    });
    try {
      const grid = [
        ['a', 'b', 'c'],
        ['b', 'c', 'd'],
        ['c', 'd', 'a'],
      ];
      await h.spinAndLand(grid);
      expect(h.reelSet.getVisibleGrid()).toEqual(grid);
      expect(h.reelSet.reels[0].axis.polarity).toBe(1);
      expect(h.reelSet.reels[1].axis.polarity).toBe(-1);
      expect(h.reelSet.reels[2].axis.polarity).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('directionPerReel with the wrong length throws at build()', () => {
    expect(() => forwardBuilder().directionPerReel(['forward', 'forward']).build()).toThrow(/length/);
  });
});
