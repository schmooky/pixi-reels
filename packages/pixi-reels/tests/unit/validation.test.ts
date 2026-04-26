import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { CascadeMode } from '../../src/spin/modes/CascadeMode.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

describe('builder validation', () => {
  it('rejects both visibleSymbols() and visibleRowsPerReel()', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .visibleSymbols(3)
        .visibleRowsPerReel([3, 5, 3])
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/cannot call both visibleSymbols\(\) and visibleRowsPerReel\(\)/);
  });

  it('rejects megaways() + visibleRowsPerReel()', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .visibleRowsPerReel([3, 5, 3])
        .megaways({ minRows: 2, maxRows: 7, reelPixelHeight: 600 })
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/cannot combine megaways\(\) with visibleRowsPerReel\(\)/);
  });

  it('rejects megaways() + cascade mode', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .megaways({ minRows: 2, maxRows: 7, reelPixelHeight: 600 })
        .symbolSize(100, 100)
        .spinningMode(new CascadeMode())
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/megaways.* not supported with cascade/);
  });

  it('rejects megaways with minRows > maxRows', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .megaways({ minRows: 7, maxRows: 2, reelPixelHeight: 600 })
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/minRows .* cannot exceed maxRows/);
  });

  it('rejects mismatched visibleRowsPerReel length', () => {
    expect(() =>
      createTestReelSet({ reels: 5, visibleRows: [3, 5, 5] }),
    ).toThrow(/length 3 must equal reels\(5\)/);
  });

  it('rejects mismatched reelPixelHeights length', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(5)
        .visibleSymbols(3)
        .symbolSize(100, 100)
        .reelPixelHeights([300, 300])
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/reelPixelHeights length 2 must equal reels\(5\)/);
  });

  it('accepts a complete megaways slot', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 6,
      megaways: { minRows: 2, maxRows: 7, reelPixelHeight: 600 },
    });
    try {
      expect(reelSet.isMegawaysSlot).toBe(true);
    } finally {
      destroy();
    }
  });
});
