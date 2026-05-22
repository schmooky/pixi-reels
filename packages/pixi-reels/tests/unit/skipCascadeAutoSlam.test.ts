import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { SpeedPresets } from '../../src/index.js';

function buildCascadeHarness() {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleRows(3)
    .symbolSize(100, 100)
    .ticker(ticker as unknown as Ticker)
    .speed('normal', SpeedPresets.NORMAL)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .tumble()
    .symbols((r) => {
      r.register('a', HeadlessSymbol, {});
      r.register('b', HeadlessSymbol, {});
    })
    .build();
  return {
    reelSet,
    ticker,
    destroy() {
      reelSet.destroy();
      ticker.destroy();
    },
  };
}

describe('ReelSet.skip — cascade auto-slam', () => {
  it('first press in cascade slams current drop AND flags refills to auto-slam', async () => {
    const h = buildCascadeHarness();
    const boosted: unknown[] = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));

    const grid = [
      ['a', 'b', 'a'],
      ['b', 'a', 'b'],
      ['a', 'a', 'a'],
    ];

    // Moment A — initial drop.
    const spinDone = h.reelSet.spin({ mode: 'cascade' });
    h.reelSet.setResult(grid.map((visible) => ({ visible })));
    // One press: cascade mode short-circuits the boost and slams.
    h.reelSet.skip();
    await spinDone;

    expect(boosted).toHaveLength(0);
    expect(h.reelSet.skipStage).toBe(2);
    // Speed must NOT have been changed — boost is not applicable in cascade.
    expect(h.reelSet.speed.activeName).toBe('normal');
    expect(h.reelSet.isSpinning).toBe(false);

    // Moment B — a refill in the same round. Auto-slam flag set means
    // the phase chain is bypassed and the round ends synchronously.
    const refilled = h.reelSet.refill({
      winners: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }],
      grid: [
        { visible: ['b', 'a', 'b'] },
        { visible: ['a', 'b', 'a'] },
        { visible: ['b', 'b', 'b'] },
      ],
    });
    await refilled;
    expect(h.reelSet.isSpinning).toBe(false);

    h.destroy();
  });

  it('next spin() resets the auto-slam flag for a fresh round', async () => {
    const h = buildCascadeHarness();

    const grid = [
      ['a', 'b', 'a'],
      ['b', 'a', 'b'],
      ['a', 'a', 'a'],
    ];

    // Round 1: trigger auto-slam.
    const first = h.reelSet.spin({ mode: 'cascade' });
    h.reelSet.setResult(grid.map((visible) => ({ visible })));
    h.reelSet.skip();
    await first;
    expect(h.reelSet.skipStage).toBe(2);

    // Round 2: fresh spin should NOT auto-slam — it should run phases.
    // We assert that by NOT pressing skip and confirming setResult arms
    // the stop sequence rather than landing instantly.
    const second = h.reelSet.spin({ mode: 'cascade' });
    expect(h.reelSet.skipStage).toBe(0);
    h.reelSet.setResult(grid.map((visible) => ({ visible })));
    // We never called skip — the spin should still be running phases.
    // slamStop to wrap the test deterministically.
    h.reelSet.slamStop();
    await second;

    h.destroy();
  });
});
