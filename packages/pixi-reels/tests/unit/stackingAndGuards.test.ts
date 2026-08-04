/**
 * A12 ride-alongs: the explicit stacking overrides (ADR 016 section 6.3) and
 * the big-symbol / directionPerReel build guard (section 6.7).
 *
 * The stacking DEFAULTS are deliberately geometric and unchanged from v1 --
 * the cell at the larger main coordinate draws in front, whichever way the
 * reel travels -- so these tests pin both the default and the override.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

describe('cellStacking', () => {
  it("defaults to 'ascending': the end-most cell draws in front", () => {
    const h = createTestReelSet({ reels: 1, visibleCells: 3, symbolIds: ['a', 'b'] });
    try {
      const reel = h.reelSet.reels[0];
      reel.refreshZIndex();
      const z = reel.symbols.map((s) => s.view.zIndex);
      for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThan(z[i - 1]);
    } finally {
      h.destroy();
    }
  });

  it("does NOT flip under direction('reverse') -- stacking is geometric", () => {
    const h = createTestReelSet({
      reels: 1,
      visibleCells: 3,
      symbolIds: ['a', 'b'],
      direction: 'reverse',
    });
    try {
      const reel = h.reelSet.reels[0];
      reel.refreshZIndex();
      const z = reel.symbols.map((s) => s.view.zIndex);
      for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThan(z[i - 1]);
    } finally {
      h.destroy();
    }
  });

  it("'descending' reverses the within-reel order", () => {
    const reelSet = new ReelSetBuilder()
      .reels(1)
      .visibleCells(3)
      .symbolSize(120, 100)
      .cellStacking('descending')
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .weights({ a: 1 })
      .ticker(new FakeTicker() as never)
      .build();
    try {
      reelSet.reels[0].refreshZIndex();
      const z = reelSet.reels[0].symbols.map((s) => s.view.zIndex);
      for (let i = 1; i < z.length; i++) expect(z[i]).toBeLessThan(z[i - 1]);
    } finally {
      reelSet.destroy();
    }
  });
});

describe('reelStacking', () => {
  it("defaults to 'ascending': the last reel draws in front", () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a'] });
    try {
      const z = h.reelSet.reels.map((r) => r.container.zIndex);
      expect(z).toEqual([0, 1, 2]);
    } finally {
      h.destroy();
    }
  });

  it("'descending' puts the first reel in front", () => {
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(120, 100)
      .reelStacking('descending')
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .weights({ a: 1 })
      .ticker(new FakeTicker() as never)
      .build();
    try {
      const z = reelSet.reels.map((r) => r.container.zIndex);
      expect(z).toEqual([0, -1, -2]);
    } finally {
      reelSet.destroy();
    }
  });
});

describe('big symbols vs directionPerReel (ADR 016 section 6.7)', () => {
  function build(directions: Array<'forward' | 'reverse'>, sizeReels: number) {
    return new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(120, 100)
      .directionPerReel(directions)
      .symbols((r) => {
        r.register('a', HeadlessSymbol, {});
        r.register('big', HeadlessSymbol, {});
      })
      .weights({ a: 1, big: 0 })
      .symbolData({ big: { size: { reels: sizeReels, cells: 2 } } })
      .ticker(new FakeTicker() as never)
      .build();
  }

  it('throws when a cross-reel block meets mixed per-reel directions', () => {
    expect(() => build(['forward', 'reverse', 'forward'], 2)).toThrowError(
      /spans 2 reels, which is not supported together with mixed directionPerReel/,
    );
  });

  it('allows a cross-reel block when every reel shares one direction', () => {
    const reelSet = build(['reverse', 'reverse', 'reverse'], 2);
    expect(reelSet.reels).toHaveLength(3);
    reelSet.destroy();
  });

  it('allows a single-reel tall block under mixed directions', () => {
    const reelSet = build(['forward', 'reverse', 'forward'], 1);
    expect(reelSet.reels).toHaveLength(3);
    reelSet.destroy();
  });
});
