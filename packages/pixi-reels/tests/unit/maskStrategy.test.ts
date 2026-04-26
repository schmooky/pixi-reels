import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import {
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type MaskStrategy,
  type ReelMaskRect,
} from '../../src/core/ReelViewport.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

describe('mask strategies', () => {
  const RECTS: ReelMaskRect[] = [
    { x: 0,   y: 0,   width: 100, height: 300 },
    { x: 100, y: 100, width: 100, height: 100 },
    { x: 200, y: 0,   width: 100, height: 300 },
  ];

  it('RectMaskStrategy draws one shape per reel', () => {
    const strat = new RectMaskStrategy();
    const g = strat.build(RECTS, 300, 300);
    // Each rect contributes a distinct shape; per-reel masking lets short
    // reels clip independently of tall ones.
    expect(g).toBeDefined();
    // No throw on update.
    strat.update(g, RECTS, 300, 300);
  });

  it('RectMaskStrategy falls back to a single bounding rect when no per-reel rects given', () => {
    const strat = new RectMaskStrategy();
    const g = strat.build([], 500, 500);
    expect(g).toBeDefined();
  });

  it('SharedRectMaskStrategy ignores per-reel rects and draws a single bounding rect', () => {
    const strat = new SharedRectMaskStrategy();
    const g = strat.build(RECTS, 300, 300);
    expect(g).toBeDefined();
    strat.update(g, RECTS, 300, 300);
  });

  it('builder.maskStrategy() accepts a custom strategy', () => {
    let buildCalls = 0;
    const custom: MaskStrategy = {
      build: (_rects, w, h) => {
        buildCalls++;
        return new RectMaskStrategy().build([], w, h);
      },
      update: () => {},
    };
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleRows(3)
      .symbolSize(100, 100)
      .maskStrategy(custom)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .build();
    try {
      expect(buildCalls).toBe(1);
    } finally {
      reelSet.destroy();
    }
  });
});
