/**
 * `BoardGrid.dim()` is the board-level counterpart to a ReelSet spotlight's
 * dim, and the partner of `lift()`: one cell forward, the rest back. The dim
 * draws above the cells' lifted art - so a dimmed cell's coin goes down with
 * it - and below the promoted layer, so a lifted cell stays out in front.
 */
import { Graphics } from 'pixi.js';
import type { RenderLayer, Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { BoardGrid } from '../../src/board/BoardGrid.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

const symbols = (r: { register: (id: string, cls: unknown, o: unknown) => void }) => {
  r.register('coin', HeadlessSymbol, {});
};

function make() {
  const ticker = new FakeTicker();
  const grid = new BoardGrid({
    cols: 3, rows: 2, cellSize: 40, gap: 0, symbols,
    ticker: ticker as unknown as Ticker,
  });
  return { grid, destroy: () => { grid.destroy(); ticker.destroy(); } };
}

/** The layer the dim rectangles draw through. */
const dimLayer = (grid: BoardGrid): RenderLayer =>
  grid.container.children.find(
    (c) => 'renderLayerChildren' in c && c !== grid.liftedLayer,
  ) as unknown as RenderLayer;

/** Rectangles currently drawn, whatever layer they belong to. */
const rects = (grid: BoardGrid) =>
  grid.container.children.filter((c) => c.children.some((k) => k instanceof Graphics))
    .flatMap((c) => c.children);

describe('BoardGrid.dim', () => {
  it('is inert until called', () => {
    const { grid, destroy } = make();
    expect(grid.dimmedCells).toEqual([]);
    expect(rects(grid)).toEqual([]);
    destroy();
  });

  it('covers every cell but the excepted ones, and clears on release', () => {
    const { grid, destroy } = make();
    const spared = { reel: 1, cell: 0 };
    const undim = grid.dim({ except: [spared] });
    expect(grid.dimmedCells).toHaveLength(5);
    expect(grid.dimmedCells).not.toContainEqual(spared);
    expect(rects(grid)).toHaveLength(5);

    undim();
    expect(grid.dimmedCells).toEqual([]);
    expect(rects(grid)).toEqual([]);
    destroy();
  });

  it('covers the whole board with no exceptions', () => {
    const { grid, destroy } = make();
    grid.dim();
    expect(grid.dimmedCells).toHaveLength(6);
    destroy();
  });

  it('applies the amount as the rectangle alpha, 0.5 by default', () => {
    const { grid, destroy } = make();
    const undim = grid.dim({ amount: 0.8 });
    expect(rects(grid).every((r) => r.alpha === 0.8)).toBe(true);
    undim();
    grid.dim();
    expect(rects(grid).every((r) => r.alpha === 0.5)).toBe(true);
    destroy();
  });

  it('draws above the lifted layer and below the promoted one', () => {
    const { grid, destroy } = make();
    const kids = grid.container.children;
    grid.lift({ reel: 0, cell: 0 });
    const promoted = grid.reelAt({ reel: 0, cell: 0 }).viewport.unmaskedContainer.parentRenderLayer!;
    const dim = dimLayer(grid);
    expect(kids.indexOf(dim)).toBeGreaterThan(kids.indexOf(grid.liftedLayer));
    expect(kids.indexOf(dim)).toBeLessThan(kids.indexOf(promoted as never));
    destroy();
  });

  it('refuses a second dim rather than silently replacing the first', () => {
    const { grid, destroy } = make();
    const undim = grid.dim();
    expect(() => grid.dim({ except: [{ reel: 0, cell: 0 }] })).toThrow(/a dim is already up/);
    undim();
    expect(() => grid.dim()).not.toThrow();
    destroy();
  });

  it('makes a repeated release a no-op', () => {
    const { grid, destroy } = make();
    const undim = grid.dim();
    undim();
    undim();
    expect(grid.dimmedCells).toEqual([]);
    destroy();
  });

  it('rejects an amount outside [0, 1] and a cell outside the grid', () => {
    const { grid, destroy } = make();
    expect(() => grid.dim({ amount: 1.5 })).toThrow(/within \[0, 1\]/);
    expect(() => grid.dim({ except: [{ reel: 9, cell: 0 }] })).toThrow(/outside the 3x2 grid/);
    // A rejected dim must leave nothing behind.
    expect(grid.dimmedCells).toEqual([]);
    expect(() => grid.dim()).not.toThrow();
    destroy();
  });

  it('drops the dim on clearDim, leaving the old release safe', () => {
    const { grid, destroy } = make();
    const undim = grid.dim();
    grid.clearDim();
    expect(grid.dimmedCells).toEqual([]);
    expect(() => undim()).not.toThrow();
    expect(() => grid.dim()).not.toThrow();
    destroy();
  });

  it('is a no-op on a destroyed board', () => {
    const { grid, destroy } = make();
    destroy();
    const undim = grid.dim();
    expect(grid.dimmedCells).toEqual([]);
    expect(() => undim()).not.toThrow();
  });
});
