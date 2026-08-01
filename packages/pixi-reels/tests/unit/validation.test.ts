import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { CascadeMode } from '../../src/spin/modes/CascadeMode.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

describe('builder validation', () => {
  it('rejects both visibleCells() and visibleCellsPerReel()', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .visibleCells(3)
        .visibleCellsPerReel([3, 5, 3])
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/cannot call both visibleCells\(\) and visibleCellsPerReel\(\)/);
  });

  it('rejects multiways() + visibleCellsPerReel()', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .visibleCellsPerReel([3, 5, 3])
        .multiways({ minCells: 2, maxCells: 7, reelExtent: 600 })
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/cannot combine multiways\(\) with visibleCellsPerReel\(\)/);
  });

  it('accepts multiways() + cascade mode (issue #74)', () => {
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .multiways({ minCells: 2, maxCells: 7, reelExtent: 600 })
      .symbolSize(100, 100)
      .spinningMode(new CascadeMode())
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .build();
    try {
      expect(reelSet.isMultiWaysSlot).toBe(true);
    } finally {
      reelSet.destroy();
    }
  });

  it('rejects multiways with minCells > maxCells', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .multiways({ minCells: 7, maxCells: 2, reelExtent: 600 })
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/minCells .* cannot exceed maxCells/);
  });

  it('rejects mismatched visibleCellsPerReel length', () => {
    expect(() =>
      createTestReelSet({ reels: 5, visibleCells: [3, 5, 5] }),
    ).toThrow(/length 3 must equal reels\(5\)/);
  });

  it('rejects mismatched reelExtents length', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(5)
        .visibleCells(3)
        .symbolSize(100, 100)
        .reelExtents([300, 300])
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/reelExtents length 2 must equal reels\(5\)/);
  });

  it('accepts a complete multiways slot', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 6,
      multiways: { minCells: 2, maxCells: 7, reelExtent: 600 },
    });
    try {
      expect(reelSet.isMultiWaysSlot).toBe(true);
    } finally {
      destroy();
    }
  });

  it('rejects multiways({reelExtent}) + reelExtents([...]) collision', () => {
    expect(() =>
      new ReelSetBuilder()
        .reels(3)
        .multiways({ minCells: 2, maxCells: 5, reelExtent: 500 })
        .reelExtents([500, 500, 500])
        .symbolSize(100, 100)
        .ticker(new FakeTicker() as unknown as Ticker)
        .symbols((r) => r.register('a', HeadlessSymbol, {}))
        .build(),
    ).toThrow(/cannot combine multiways\({reelExtent}\) with reelExtents/);
  });
});
