import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { Graphics } from 'pixi.js';
import type { RenderLayer } from 'pixi.js';
import { BoardGrid } from '../../src/board/BoardGrid.js';
import { SharedRectMaskStrategy } from '../../src/core/ReelViewport.js';
import { ReelSet } from '../../src/core/ReelSet.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

const ticker = () => new FakeTicker() as unknown as Ticker;
const make = (over = {}) =>
  new BoardGrid({
    cols: 3,
    rows: 2,
    cellSize: 80,
    gap: 4,
    symbols: (r) => r.register('a', HeadlessSymbol, {}),
    weights: { a: 1, empty: 3 },
    ticker: ticker(),
    ...over,
  });

describe('BoardGrid', () => {
  it('builds one reel per cell, cell-major', () => {
    const grid = make();
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(2);
    const cells = grid.cells();
    expect(cells).toHaveLength(6);
    expect(cells).toContainEqual({ reel: 0, cell: 0 });
    expect(cells).toContainEqual({ reel: 2, cell: 1 });
    // a fresh array each call (no internal leakage)
    expect(grid.cells()).not.toBe(grid.cells());
    grid.destroy();
  });

  it('computes cell geometry from size + gap', () => {
    const grid = make();
    expect(grid.cellBounds({ reel: 1, cell: 0 })).toEqual({ x: 84, y: 0, width: 80, height: 80 });
    expect(grid.cellCenter({ reel: 0, cell: 0 })).toEqual({ x: 40, y: 40 });
    expect(grid.cellCenter({ reel: 2, cell: 1 })).toEqual({ x: 2 * 84 + 40, y: 1 * 84 + 40 });
    grid.destroy();
  });

  it('exposes a live symbol and reel per cell', () => {
    const grid = make();
    expect(grid.symbolAt({ reel: 0, cell: 0 })).toBeDefined();
    expect(grid.reelAt({ reel: 1, cell: 1 })).toBeDefined();
    grid.place({ reel: 0, cell: 0 }, 'a');
    expect(grid.symbolAt({ reel: 0, cell: 0 })).toBeDefined();
    grid.destroy();
  });

  it('throws when addressing a cell outside the grid', () => {
    const grid = make();
    expect(() => grid.symbolAt({ reel: 9, cell: 9 })).toThrow(/outside the/);
    expect(() => grid.reelAt({ reel: 9, cell: 9 })).toThrow(/outside the/);
    grid.destroy();
  });

  it('defaults emptyId, gap and a single profile', () => {
    const grid = new BoardGrid({
      cols: 1,
      rows: 1,
      cellSize: 60,
      symbols: (r) => r.register('a', HeadlessSymbol, {}),
      ticker: ticker(),
    });
    expect(grid.emptyId).toBe('empty');
    expect(grid.gap).toBe(4);
    expect(() => grid.setProfile({ reel: 0, cell: 0 }, 'default')).not.toThrow();
    grid.destroy();
  });

  it('reports nothing in flight when idle, and is destroyable once', () => {
    const grid = make();
    expect(grid.skipSpinning()).toBe(0);
    expect(grid.isDestroyed).toBe(false);
    grid.destroy();
    expect(grid.isDestroyed).toBe(true);
    expect(() => grid.destroy()).not.toThrow(); // idempotent
  });

  it('requires a ticker', () => {
    expect(
      () =>
        new BoardGrid({
          cols: 1,
          rows: 1,
          cellSize: 60,
          symbols: (r) => r.register('a', HeadlessSymbol, {}),
          ticker: undefined as unknown as Ticker,
        }),
    ).toThrow(/ticker is required/);
  });
});

describe('BoardGrid rectangular cells and per-axis gaps', () => {
  it('lays out width x height cells with separate column and row gaps', () => {
    const grid = make({ cellSize: { width: 100, height: 60 }, columnGap: 6, rowGap: 2 });
    expect(grid.cellWidth).toBe(100);
    expect(grid.cellHeight).toBe(60);
    expect(grid.columnGap).toBe(6);
    expect(grid.rowGap).toBe(2);
    expect(grid.cellBounds({ reel: 1, cell: 1 })).toEqual({ x: 106, y: 62, width: 100, height: 60 });
    expect(grid.cellCenter({ reel: 2, cell: 0 })).toEqual({ x: 2 * 106 + 50, y: 30 });
    grid.destroy();
  });

  it('sizes each cell reel to the rectangle, not a square', () => {
    const grid = make({ cellSize: { width: 100, height: 60 } });
    grid.place({ reel: 0, cell: 0 }, 'a');
    const symbol = grid.symbolAt({ reel: 0, cell: 0 }) as HeadlessSymbol;
    expect(symbol.width).toBe(100);
    expect(symbol.height).toBe(60);
    grid.destroy();
  });

  it('falls back from the uniform gap when only one axis is given', () => {
    const grid = make({ gap: 5, rowGap: 0 });
    expect(grid.columnGap).toBe(5);
    expect(grid.rowGap).toBe(0);
    expect(grid.cellBounds({ reel: 1, cell: 1 })).toEqual({ x: 85, y: 80, width: 80, height: 80 });
    grid.destroy();
  });

  it('keeps cellSize and gap as aliases for square boards', () => {
    const grid = make({ cellSize: 64, gap: 3 });
    expect(grid.cellSize).toBe(64);
    expect(grid.gap).toBe(3);
    grid.destroy();
  });

  it('hands chrome the cell width and height', () => {
    const seen: Array<[number, number]> = [];
    const grid = make({
      cellSize: { width: 100, height: 60 },
      chrome: (_g: unknown, width: number, height: number) => {
        seen.push([width, height]);
      },
    });
    expect(seen).toHaveLength(6);
    expect(seen[0]).toEqual([100, 60]);
    grid.destroy();
  });
});

describe('BoardGrid render order', () => {
  it('draws every chrome under every reel and lifts unmasked views above all cells', () => {
    const grid = make({ chrome: (g: Graphics) => { g.rect(0, 0, 1, 1); } });
    const kids = grid.container.children;
    // 6 cells: chrome x6, reel set x6, then the one lifted layer
    expect(kids).toHaveLength(13);
    expect(kids.slice(0, 6).every((c) => c instanceof Graphics)).toBe(true);
    expect(kids.slice(6, 12).every((c) => c instanceof ReelSet)).toBe(true);
    const layer = kids[12] as unknown as RenderLayer;
    expect(layer.renderLayerChildren).toHaveLength(6);
    for (const cell of grid.cells()) {
      expect(layer.renderLayerChildren).toContain(grid.reelAt(cell).viewport.unmaskedContainer);
    }
    grid.destroy();
  });
});

describe('BoardGrid cell mask', () => {
  it('builds one mask strategy per cell from the factory', () => {
    let built = 0;
    const grid = make({
      mask: () => {
        built += 1;
        return new SharedRectMaskStrategy();
      },
    });
    expect(built).toBe(6);
    grid.destroy();
  });
});
