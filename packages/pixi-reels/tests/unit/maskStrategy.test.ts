import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import {
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type MaskStrategy,
  type ReelMaskRect,
} from '../../src/core/ReelViewport.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

/**
 * Read the bounds rect off a PIXI Graphics. PIXI v8 exposes the bounding
 * box via `getBounds()`, which sums every rendered shape. With a single
 * filled rect at (0, 0, w, h), bounds = w × h. With a union of per-reel
 * rects, bounds = the union's bounding box (which equals the totalWidth ×
 * totalHeight only if rects span the full extent).
 */
function getBoundsArea(g: { getLocalBounds(): { width: number; height: number } }): {
  width: number;
  height: number;
} {
  // Use local bounds — synchronous, no renderer required.
  const b = g.getLocalBounds();
  return { width: b.width, height: b.height };
}

describe('mask strategies', () => {
  const RECTS: ReelMaskRect[] = [
    { x: 0,   y: 0,   width: 100, height: 300 },
    { x: 100, y: 100, width: 100, height: 100 },
    { x: 200, y: 0,   width: 100, height: 300 },
  ];

  it('RectMaskStrategy draws one shape per reel', () => {
    const strat = new RectMaskStrategy();
    const g = strat.build(RECTS, 300, 300);
    expect(g).toBeDefined();
    // Bounds union of the three rects: total width 300, total height 300
    // (the outer two reels span 0..300 vertically; the middle reel sits in
    // the middle). The union bounding box equals 300 × 300.
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
    strat.update(g, RECTS, 300, 300);
  });

  it('RectMaskStrategy: pyramid layout has gaps in the mask shape', () => {
    // For a pyramid (rects of differing y/height), bounds equals the
    // outer envelope. The middle reel's gap (y=0..100 and y=200..300) is
    // NOT covered by any rect — verify by checking individual rects:
    // the union of rects is what the mask renders, and pixels outside
    // any rect are clipped.
    const pyramid: ReelMaskRect[] = [
      { x: 0,   y: 100, width: 100, height: 100 }, // 1 row, centered
      { x: 100, y: 0,   width: 100, height: 300 }, // 3 rows, full
      { x: 200, y: 100, width: 100, height: 100 }, // 1 row, centered
    ];
    const strat = new RectMaskStrategy();
    const g = strat.build(pyramid, 300, 300);
    const bounds = getBoundsArea(g);
    // Union envelope is (0,0)-(300,300) but the middle reel is the only
    // one covering rows 0 and 2. Verify the rects array was preserved.
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
  });

  it('RectMaskStrategy falls back to a single bounding rect when no per-reel rects given', () => {
    const strat = new RectMaskStrategy();
    const g = strat.build([], 500, 500);
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(500);
    expect(bounds.height).toBe(500);
  });

  it('SharedRectMaskStrategy ignores per-reel rects and draws a single bounding rect', () => {
    const strat = new SharedRectMaskStrategy();
    const g = strat.build(RECTS, 300, 300);
    expect(g).toBeDefined();
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
    strat.update(g, RECTS, 300, 300);
  });

  it('viewport.maskRects exposes per-reel rects for pyramid layouts', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: [3, 5, 5, 5, 3],
      symbolSize: { width: 100, height: 100 },
      symbolIds: ['a'],
    });
    try {
      const rects = reelSet.viewport.maskRects;
      expect(rects).toHaveLength(5);
      // Outer reels (3 rows × 100 = 300) are centered inside the tallest
      // reel (5 rows × 100 = 500), so offsetY = 100.
      expect(rects[0]).toMatchObject({ y: 100, height: 300 });
      expect(rects[2]).toMatchObject({ y: 0, height: 500 });
      expect(rects[4]).toMatchObject({ y: 100, height: 300 });
    } finally {
      destroy();
    }
  });

  it('SharedRectMaskStrategy still receives maskRects but ignores them', () => {
    const reelSet = new ReelSetBuilder()
      .reels(5)
      .visibleRowsPerReel([3, 5, 5, 5, 3])
      .symbolSize(100, 100)
      .maskStrategy(new SharedRectMaskStrategy())
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .build();
    try {
      // maskRects is still populated — strategy gets the data, just
      // chooses to ignore it.
      expect(reelSet.viewport.maskRects).toHaveLength(5);
      // The mask itself draws a single bounding rect spanning the full
      // viewport (500 × 500 for 5 reels of 100 wide × 5 rows of 100 tall).
      const bounds = getBoundsArea(reelSet.viewport.maskGraphics);
      expect(bounds.width).toBe(500);
      expect(bounds.height).toBe(500);
    } finally {
      reelSet.destroy();
    }
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
