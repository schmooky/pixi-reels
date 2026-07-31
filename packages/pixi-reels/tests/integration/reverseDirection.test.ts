/**
 * Per-reel travel direction API (A9). The ReelAxis is threaded through the
 * motion + phase layers, and the builder exposes direction()/directionPerReel()/
 * orientation(). The set-level geometry and the StopSequencer feed edge are not
 * direction/orientation-aware yet (ADR 016 section 6.1), so non-forward-vertical
 * builds fail loud instead of spinning forever. This locks in that contract and
 * proves the axis wiring stays byte-identical for the supported forward path.
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

describe('per-reel direction API (A9)', () => {
  it('explicit forward + all-forward directionPerReel still spins and lands (axis wiring is a no-op)', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'b', 'c', 'd'],
      directionPerReel: ['forward', 'forward', 'forward'],
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
    } finally {
      h.destroy();
    }
  });

  it('reverse direction fails loud (StopSequencer feed edge not yet direction-aware)', () => {
    expect(() => forwardBuilder().direction('reverse').build()).toThrow(/reverse/);
  });

  it('directionPerReel containing reverse fails loud', () => {
    expect(() => forwardBuilder().directionPerReel(['forward', 'reverse', 'forward']).build()).toThrow(
      /reverse/,
    );
  });

  it('directionPerReel with the wrong length throws at build()', () => {
    expect(() => forwardBuilder().directionPerReel(['forward', 'forward']).build()).toThrow(/length/);
  });

  it("orientation('horizontal') fails loud until its geometry lands", () => {
    expect(() => forwardBuilder().orientation('horizontal').build()).toThrow(/horizontal/);
  });
});
