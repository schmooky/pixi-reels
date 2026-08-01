/**
 * Horizontal orientation (uniform grids). A single horizontal reel is the
 * banner that replaces the old HorizontalReel subtree: cells march along X, the
 * strip travels on X, and it spins + lands through the same lifecycle as a
 * vertical reel. Non-square symbols (120x80) make an axis swap observable.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

const SIZE = { width: 120, height: 80 };

describe('horizontal orientation', () => {
  it('a single horizontal reel (banner) spins and lands, cells along X', async () => {
    const h = createTestReelSet({
      reels: 1,
      visibleCells: 5,
      symbolIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      orientation: 'horizontal',
      symbolSize: SIZE,
    });
    try {
      const grid = [['a', 'b', 'c', 'd', 'e']];
      await h.spinAndLand(grid);
      expect(h.reelSet.getVisibleGrid()).toEqual(grid);

      const reel = h.reelSet.reels[0];
      expect(reel.axis.orientation).toBe('horizontal');
      expect(reel.axis.mainProp).toBe('x');

      // Cells march along X (main), share Y (cross); each is 120x80 screen.
      const c0 = h.reelSet.getCellBounds(0, 0);
      const c1 = h.reelSet.getCellBounds(0, 1);
      expect(c0.width).toBe(120);
      expect(c0.height).toBe(80);
      expect(c1.y).toBe(c0.y);
      expect(c1.x - c0.x).toBeCloseTo(120, 5); // one main pitch (symbolWidth + 0 gap)
    } finally {
      h.destroy();
    }
  });

  it('a vertical control with the same non-square cells marches along Y', () => {
    const h = createTestReelSet({ reels: 1, visibleCells: 3, symbolIds: ['a', 'b'], symbolSize: SIZE });
    try {
      const c0 = h.reelSet.getCellBounds(0, 0);
      const c1 = h.reelSet.getCellBounds(0, 1);
      expect(c1.x).toBe(c0.x); // same cross (x)
      expect(c1.y - c0.y).toBeCloseTo(80, 5); // one main pitch (symbolHeight)
    } finally {
      h.destroy();
    }
  });

  it('horizontal + MultiWays builds (the uniform-only guard is gone)', () => {
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .symbolSize(120, 80)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => r.register('a', HeadlessSymbol, {}))
      .weights({ a: 1 })
      .orientation('horizontal')
      .multiways({ minCells: 2, maxCells: 5, reelExtent: 400 })
      .build();
    try {
      // Every reel starts at maxCells. Like a vertical MultiWays set, the
      // cell starts at the SPIN size (the configured main cell extent, here
      // symbolWidth = 120) and AdjustPhase reshapes it to the per-reel value
      // on the first spin. `extent` is the fixed reelExtent throughout.
      for (const reel of reelSet.reels) {
        expect(reel.visibleCells).toBe(5);
        expect(reel.extent).toBe(400);
        expect(reel.cellMain).toBe(120);
        expect(reel.symbolWidth).toBe(120); // main lands on WIDTH under horizontal
        expect(reel.symbolHeight).toBe(80); // cross is the constant height
      }
    } finally {
      reelSet.destroy();
    }
  });
});

/**
 * Jagged shapes sideways. The vertical case varies each reel's cell HEIGHT
 * and stacks reels along x; the horizontal case must vary WIDTH and stack
 * along y, from the same arithmetic. Non-square cells and a non-square gap
 * make a transposition observable.
 */
describe('horizontal pyramid (per-reel cell counts)', () => {
  const SHAPE = [2, 4, 2];

  it('sizes each reel along the main axis and marches reels on the cross axis', () => {
    const h = createTestReelSet({
      reels: 3,
      visibleCells: SHAPE,
      symbolIds: ['a', 'b'],
      orientation: 'horizontal',
      symbolSize: { width: 100, height: 60 },
      symbolGap: { x: 10, y: 4 },
    });
    try {
      for (let r = 0; r < SHAPE.length; r++) {
        const reel = h.reelSet.reels[r];
        expect(reel.visibleCells).toBe(SHAPE[r]);
        // Main extent = cells * cellMain + gaps, on X.
        expect(reel.extent).toBe(SHAPE[r] * 100 + (SHAPE[r] - 1) * 10);
        // Cell size stays 100x60: a pyramid varies the COUNT, not the cell.
        expect(reel.symbolWidth).toBe(100);
        expect(reel.symbolHeight).toBe(60);
      }
      // Short reels are centred inside the longest reel's extent, along X.
      const longest = 4 * 100 + 3 * 10;
      const short = 2 * 100 + 1 * 10;
      expect(h.reelSet.getCellBounds(0, 0).x).toBeCloseTo((longest - short) / 2, 5);
      expect(h.reelSet.getCellBounds(1, 0).x).toBe(0);
      // Reels march along Y by (cross cell + cross gap) = 60 + 4.
      expect(h.reelSet.getCellBounds(1, 0).y - h.reelSet.getCellBounds(0, 0).y).toBe(64);
    } finally {
      h.destroy();
    }
  });

  it('is the vertical pyramid transposed, cell for cell', () => {
    const v = createTestReelSet({
      reels: 3,
      visibleCells: SHAPE,
      symbolIds: ['a', 'b'],
      symbolSize: { width: 60, height: 100 },
      symbolGap: { x: 4, y: 10 },
    });
    const h = createTestReelSet({
      reels: 3,
      visibleCells: SHAPE,
      symbolIds: ['a', 'b'],
      orientation: 'horizontal',
      symbolSize: { width: 100, height: 60 },
      symbolGap: { x: 10, y: 4 },
    });
    try {
      for (let r = 0; r < SHAPE.length; r++) {
        for (let c = 0; c < SHAPE[r]; c++) {
          const vb = v.reelSet.getCellBounds(r, c);
          expect(h.reelSet.getCellBounds(r, c)).toEqual({
            x: vb.y,
            y: vb.x,
            width: vb.height,
            height: vb.width,
          });
        }
      }
    } finally {
      v.destroy();
      h.destroy();
    }
  });

  it('spins and lands a jagged grid', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleCells: SHAPE,
      symbolIds: ['a', 'b', 'c'],
      orientation: 'horizontal',
      symbolSize: { width: 100, height: 60 },
      symbolGap: { x: 10, y: 4 },
    });
    try {
      const grid = [['a', 'b'], ['c', 'a', 'b', 'c'], ['b', 'a']];
      await h.spinAndLand(grid);
      expect(h.reelSet.getVisibleGrid()).toEqual(grid);
    } finally {
      h.destroy();
    }
  });
});

/**
 * MultiWays sideways: setShape() must reshape along X, keeping each reel's
 * main extent fixed and dividing it into the new cell count. This is ADR 016
 * section 6.6 - Reel.reshape and ReelMotion.reshape read the MAIN gap, not
 * symbolGapY.
 */
describe('horizontal MultiWays', () => {
  const build = () =>
    createTestReelSet({
      reels: 3,
      multiways: { minCells: 2, maxCells: 5, reelExtent: 420 },
      symbolIds: ['a', 'b', 'c'],
      orientation: 'horizontal',
      symbolSize: { width: 100, height: 60 },
      symbolGap: { x: 10, y: 4 },
    });

  it('reshapes along X, holding the reel extent fixed', async () => {
    const h = build();
    try {
      const shape = [2, 5, 3];
      const spin = h.reelSet.spin();
      h.reelSet.setShape(shape);
      h.reelSet.setResult(
        shape.map((n) => ({ visible: Array.from({ length: n }, () => 'a') })),
      );
      h.reelSet.slamStop();
      await spin;

      for (let r = 0; r < shape.length; r++) {
        const reel = h.reelSet.reels[r];
        expect(reel.visibleCells).toBe(shape[r]);
        // The extent is fixed by multiways({ reelExtent }); the CELL size
        // absorbs the shape change, on the main (x) axis.
        expect(reel.extent).toBeCloseTo(420, 5);
        expect(reel.symbolWidth).toBeCloseTo((420 - (shape[r] - 1) * 10) / shape[r], 5);
        // Cross size never moves.
        expect(reel.symbolHeight).toBe(60);
      }
    } finally {
      h.destroy();
    }
  });

  it('lands the reshaped grid', async () => {
    const h = build();
    try {
      const shape = [3, 4, 2];
      const grid = shape.map((n, r) =>
        Array.from({ length: n }, (_, c) => ['a', 'b', 'c'][(r + c) % 3]),
      );
      const spin = h.reelSet.spin();
      h.reelSet.setShape(shape);
      h.reelSet.setResult(grid.map((visible) => ({ visible })));
      h.reelSet.slamStop();
      await spin;
      expect(h.reelSet.getVisibleGrid()).toEqual(grid);
    } finally {
      h.destroy();
    }
  });
});

/**
 * Big symbols sideways (ADR 016 section 6.7). `size.reels` spans the CROSS
 * axis and `size.cells` the MAIN axis in every orientation, so a 2x2 stays
 * 2 reels by 2 cells - and the screen width/height it maps to invert under
 * horizontal even though `getBlockBounds` keeps its name and return shape.
 */
describe('horizontal big symbols', () => {
  const BIG = { reels: 2, cells: 3 };
  const opts = (orientation: 'vertical' | 'horizontal') => ({
    reels: 3,
    visibleCells: 4,
    symbolIds: ['a', 'big'],
    orientation,
    symbolSize:
      orientation === 'vertical'
        ? { width: 60, height: 100 }
        : { width: 100, height: 60 },
    symbolGap: orientation === 'vertical' ? { x: 4, y: 10 } : { x: 10, y: 4 },
    weights: { a: 1, big: 0 },
    symbolData: { big: { size: BIG, weight: 0 } },
  });

  const land = async (orientation: 'vertical' | 'horizontal') => {
    const h = createTestReelSet(opts(orientation));
    await h.spinAndLand([
      { visible: ['big', 'a', 'a', 'a'] },
      { visible: ['a', 'a', 'a', 'a'] },
      { visible: ['a', 'a', 'a', 'a'] },
    ]);
    return h;
  };

  it('spans reels on the cross axis and cells on the main axis', async () => {
    const h = await land('horizontal');
    try {
      const b = h.reelSet.getBlockBounds(0, 0);
      // 3 cells along X: 3*100 + 2*10 = 320. 2 reels along Y: 2*60 + 1*4 = 124.
      expect(b.width).toBe(3 * 100 + 2 * 10);
      expect(b.height).toBe(2 * 60 + 1 * 4);
      expect(b.x).toBe(0);
      expect(b.y).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('is the vertical block transposed', async () => {
    const v = await land('vertical');
    const h = await land('horizontal');
    try {
      const vb = v.reelSet.getBlockBounds(0, 0);
      expect(h.reelSet.getBlockBounds(0, 0)).toEqual({
        x: vb.y,
        y: vb.x,
        width: vb.height,
        height: vb.width,
      });
    } finally {
      v.destroy();
      h.destroy();
    }
  });

  it('resolves the same footprint from any cell of the block', async () => {
    const h = await land('horizontal');
    try {
      for (let r = 0; r < BIG.reels; r++) {
        for (let c = 0; c < BIG.cells; c++) {
          const fp = h.reelSet.getSymbolFootprint(r, c);
          expect(fp.anchor).toEqual({ reel: 0, cell: 0 });
          expect(fp.size).toEqual(BIG);
        }
      }
    } finally {
      h.destroy();
    }
  });
});
