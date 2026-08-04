import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { BoardGrid } from '../../src/board/BoardGrid.js';
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
