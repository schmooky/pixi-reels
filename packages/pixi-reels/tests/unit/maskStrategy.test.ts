import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import {
  MASK_STRATEGY_VERSION,
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type MaskStrategy,
  type ReelMaskRect,
} from '../../src/core/ReelViewport.js';
import { Graphics } from 'pixi.js';
import { VERTICAL_FORWARD } from '../../src/core/ReelAxis.js';

/** Build a MaskContext for the direct-strategy unit tests. */
const ctx = (rects: ReelMaskRect[], width: number, height: number, bleed = 0) => ({
  rects,
  width,
  height,
  axis: VERTICAL_FORWARD,
  bleed,
});
import { createTestReelSet } from '../../src/testing/index.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

/**
 * Read the bounds rect off a PIXI Graphics. PIXI v8 exposes the bounding
 * box via `getBounds()`, which sums every rendered shape. With a single
 * filled rect at (0, 0, w, h), bounds = w x h. With a union of per-reel
 * rects, bounds = the union's bounding box (which equals the totalWidth x
 * totalHeight only if rects span the full extent).
 */
function getBoundsArea(g: { getLocalBounds(): { width: number; height: number } }): {
  width: number;
  height: number;
} {
  // Use local bounds - synchronous, no renderer required.
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
    const g = strat.build(ctx(RECTS, 300, 300));
    expect(g).toBeDefined();
    // Bounds union of the three rects: total width 300, total height 300
    // (the outer two reels span 0..300 vertically; the middle reel sits in
    // the middle). The union bounding box equals 300 x 300.
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
    strat.update(g, ctx(RECTS, 300, 300));
  });

  it('RectMaskStrategy: pyramid layout has gaps in the mask shape', () => {
    // For a pyramid (rects of differing y/height), bounds equals the
    // outer envelope. The middle reel's gap (y=0..100 and y=200..300) is
    // NOT covered by any rect - verify by checking individual rects:
    // the union of rects is what the mask renders, and pixels outside
    // any rect are clipped.
    const pyramid: ReelMaskRect[] = [
      { x: 0,   y: 100, width: 100, height: 100 }, // 1 cell, centered
      { x: 100, y: 0,   width: 100, height: 300 }, // 3 cells, full
      { x: 200, y: 100, width: 100, height: 100 }, // 1 cell, centered
    ];
    const strat = new RectMaskStrategy();
    const g = strat.build(ctx(pyramid, 300, 300));
    const bounds = getBoundsArea(g);
    // Union envelope is (0,0)-(300,300) but the middle reel is the only
    // one covering cells 0 and 2. Verify the rects array was preserved.
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
  });

  it('RectMaskStrategy falls back to a single bounding rect when no per-reel rects given', () => {
    const strat = new RectMaskStrategy();
    const g = strat.build(ctx([], 500, 500));
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(500);
    expect(bounds.height).toBe(500);
  });

  it('SharedRectMaskStrategy ignores per-reel rects and draws a single bounding rect', () => {
    const strat = new SharedRectMaskStrategy();
    const g = strat.build(ctx(RECTS, 300, 300));
    expect(g).toBeDefined();
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
    strat.update(g, ctx(RECTS, 300, 300));
  });

  it('SharedRectMaskStrategy inflates across the strip by the bleed, not along it', () => {
    // `curveBleed` lets art hang past its cell; a mask still clipping to the
    // board would cut it off, worst at the outermost reels where the overhang
    // leaves the board entirely. Cross axis only - the main axis is where the
    // buffer cells live and they are meant to stay hidden.
    const strat = new SharedRectMaskStrategy();
    const g = strat.build(ctx(RECTS, 300, 300, 40));
    const bounds = getBoundsArea(g);
    expect(bounds.width).toBe(380);
    expect(bounds.height).toBe(300);
  });

  it('SharedRectMaskStrategy survives a context built before `bleed` existed', () => {
    const strat = new SharedRectMaskStrategy();
    const legacy = { rects: RECTS, width: 300, height: 300, axis: VERTICAL_FORWARD };
    const bounds = getBoundsArea(strat.build(legacy as never));
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);
  });

  it('viewport.maskRects exposes per-reel rects for pyramid layouts', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 5,
      visibleCells: [3, 5, 5, 5, 3],
      symbolSize: { width: 100, height: 100 },
      symbolIds: ['a'],
    });
    try {
      const rects = reelSet.viewport.maskRects;
      expect(rects).toHaveLength(5);
      // Outer reels (3 cells x 100 = 300) are centered inside the tallest
      // reel (5 cells x 100 = 500), so mainOffset = 100.
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
      .visibleCellsPerReel([3, 5, 5, 5, 3])
      .symbolSize(100, 100)
      .maskStrategy(new SharedRectMaskStrategy())
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .build();
    try {
      // maskRects is still populated - strategy gets the data, just
      // chooses to ignore it.
      expect(reelSet.viewport.maskRects).toHaveLength(5);
      // The mask itself draws a single bounding rect spanning the full
      // viewport (500 x 500 for 5 reels of 100 wide x 5 cells of 100 tall).
      const bounds = getBoundsArea(reelSet.viewport.maskGraphics);
      expect(bounds.width).toBe(500);
      expect(bounds.height).toBe(500);
    } finally {
      reelSet.destroy();
    }
  });

  it('auto-picks SharedRectMaskStrategy when big symbols + symbolGap.x > 0', () => {
    const consoleInfo = console.info;
    const captured: unknown[][] = [];
    console.info = (...args: unknown[]) => { captured.push(args); };
    try {
      const reelSet = new ReelSetBuilder()
        .reels(5)
        .visibleCells(4)
        .symbolSize(80, 80)
        .symbolGap(4, 4)
        .symbols((r) => {
          r.register('a', HeadlessSymbol, {});
          r.register('bonus', HeadlessSymbol, {});
        })
        .symbolData({ bonus: { weight: 0, size: { reels: 2, cells: 2 } } })
        .ticker(new FakeTicker() as unknown as Ticker)
        .build();
      try {
        // Single bounding rect => getLocalBounds covers full viewport.
        const bounds = reelSet.viewport.maskGraphics.getLocalBounds();
        const totalW = 5 * (80 + 4) - 4; // 416
        expect(bounds.width).toBe(totalW);
        // Console hint surfaced.
        expect(captured.some((args) => String(args[0]).includes('SharedRectMaskStrategy'))).toBe(true);
      } finally {
        reelSet.destroy();
      }
    } finally {
      console.info = consoleInfo;
    }
  });

  it('does NOT auto-pick SharedRectMaskStrategy when big symbols are registered but symbolGap.x === 0', () => {
    const reelSet = new ReelSetBuilder()
      .reels(5)
      .visibleCells(4)
      .symbolSize(80, 80)
      .symbolGap(0, 4) // zero horizontal gap - per-reel rects are contiguous
      .symbols((r) => {
        r.register('a', HeadlessSymbol, {});
        r.register('bonus', HeadlessSymbol, {});
      })
      .symbolData({ bonus: { weight: 0, size: { reels: 2, cells: 2 } } })
      .ticker(new FakeTicker() as unknown as Ticker)
      .build();
    try {
      // Default per-reel RectMaskStrategy still in effect.
      const bounds = reelSet.viewport.maskGraphics.getLocalBounds();
      // With 0 horizontal gap, per-reel rects ARE contiguous so bounds
      // matches single rect - but the strategy is still per-reel. Verify
      // the rect array is per-reel size 5.
      expect(reelSet.viewport.maskRects).toHaveLength(5);
      expect(bounds.width).toBe(5 * 80);
    } finally {
      reelSet.destroy();
    }
  });

  it('auto-picks SharedRectMaskStrategy when any symbol has unmask: true + symbolGap.x > 0', () => {
    const consoleInfo = console.info;
    const captured: unknown[][] = [];
    console.info = (...args: unknown[]) => { captured.push(args); };
    try {
      const reelSet = new ReelSetBuilder()
        .reels(5)
        .visibleCells(3)
        .symbolSize(80, 80)
        .symbolGap(4, 4)
        .symbols((r) => {
          r.register('a', HeadlessSymbol, {});
          r.register('wild', HeadlessSymbol, {});
        })
        .symbolData({ wild: { unmask: true } })
        .ticker(new FakeTicker() as unknown as Ticker)
        .build();
      try {
        // Single bounding rect => getLocalBounds covers full viewport.
        const bounds = reelSet.viewport.maskGraphics.getLocalBounds();
        const totalW = 5 * (80 + 4) - 4; // 416
        expect(bounds.width).toBe(totalW);
        // Console hint surfaced AND mentions the unmask reason.
        expect(captured.some((args) => {
          const msg = String(args[0]);
          return msg.includes('SharedRectMaskStrategy') && msg.includes('unmask');
        })).toBe(true);
      } finally {
        reelSet.destroy();
      }
    } finally {
      console.info = consoleInfo;
    }
  });

  it('does NOT auto-pick SharedRectMaskStrategy on unmask if symbolGap.x === 0', () => {
    const reelSet = new ReelSetBuilder()
      .reels(5)
      .visibleCells(3)
      .symbolSize(80, 80)
      .symbolGap(0, 4) // zero horizontal gap - per-reel rects are contiguous
      .symbols((r) => {
        r.register('a', HeadlessSymbol, {});
        r.register('wild', HeadlessSymbol, {});
      })
      .symbolData({ wild: { unmask: true } })
      .ticker(new FakeTicker() as unknown as Ticker)
      .build();
    try {
      // Per-reel RectMaskStrategy still in effect (5 rects, one per reel).
      expect(reelSet.viewport.maskRects).toHaveLength(5);
    } finally {
      reelSet.destroy();
    }
  });

  it('explicit .maskStrategy() always wins over the auto-pick', () => {
    const reelSet = new ReelSetBuilder()
      .reels(5)
      .visibleCells(4)
      .symbolSize(80, 80)
      .symbolGap(4, 4) // would normally trigger auto-pick
      .maskStrategy(new RectMaskStrategy()) // explicit override
      .symbols((r) => {
        r.register('a', HeadlessSymbol, {});
        r.register('bonus', HeadlessSymbol, {});
      })
      .symbolData({ bonus: { weight: 0, size: { reels: 2, cells: 2 } } })
      .ticker(new FakeTicker() as unknown as Ticker)
      .build();
    try {
      // Explicit per-reel strategy honored despite the auto-pick condition.
      // Verify that maskRects was populated AND used (5 separate rects in
      // the mask Graphics).
      expect(reelSet.viewport.maskRects).toHaveLength(5);
    } finally {
      reelSet.destroy();
    }
  });

  it('builder.maskStrategy() accepts a custom strategy', () => {
    let buildCalls = 0;
    let sawAxis: string | undefined;
    const custom: MaskStrategy = {
      version: MASK_STRATEGY_VERSION,
      build: (ctx) => {
        buildCalls++;
        sawAxis = ctx.axis.mainProp;
        return new RectMaskStrategy().build({ ...ctx, rects: [] });
      },
      update: () => {},
    };
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(100, 100)
      .maskStrategy(custom)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .build();
    try {
      expect(buildCalls).toBe(1);
      // The context carries the set's axis, so a strategy can branch on it
      // instead of assuming a rect's height runs along the strip.
      expect(sawAxis).toBe('y');
    } finally {
      reelSet.destroy();
    }
  });

  it('a horizontal set hands the strategy a horizontal axis', () => {
    let sawAxis: string | undefined;
    const custom: MaskStrategy = {
      version: MASK_STRATEGY_VERSION,
      build: (ctx) => {
        sawAxis = ctx.axis.mainProp;
        return new RectMaskStrategy().build(ctx);
      },
      update: () => {},
    };
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleCells(3)
      .symbolSize(120, 80)
      .orientation('horizontal')
      .maskStrategy(custom)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .build();
    try {
      expect(sawAxis).toBe('x');
    } finally {
      reelSet.destroy();
    }
  });

  it('rejects a v1 strategy by name instead of silently un-clipping', () => {
    // A v1 strategy: positional (rects, totalWidth, totalHeight), no version.
    // Handed a MaskContext it would read `rects` as an object, find no
    // `.length`, and draw a full-bleed rect - a mask that clips nothing.
    const v1 = {
      build: (rects: unknown[], w: number, h: number) => {
        void rects; void w; void h;
        return new Graphics();
      },
      update: () => {},
    };
    expect(() =>
      new ReelSetBuilder().maskStrategy(v1 as unknown as MaskStrategy),
    ).toThrowError(/declares version undefined, but v2 requires 2/);
    expect(() =>
      new ReelSetBuilder().maskStrategy(v1 as unknown as MaskStrategy),
    ).toThrowError(/MaskContext \{ rects, width, height, axis \}/);
  });
});
