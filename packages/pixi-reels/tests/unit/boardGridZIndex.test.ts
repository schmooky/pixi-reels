/**
 * `BoardGrid` renders every cell's lifted art in one `RenderLayer` above all
 * cells, in attach order (column-major) - so a lower cell's overflowing coin
 * is covered by the next column's. `cellZIndex` makes that layer sortable
 * and asks the consumer for each cell's order whenever a cell's symbol
 * changes.
 */
import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { BoardGrid } from '../../src/board/BoardGrid.js';
import { HoldAndWinBuilder } from '../../src/board/HoldAndWinBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { BoardCellZIndexContext, BoardCellZIndexResolver } from '../../src/board/BoardGrid.js';

const symbols = (r: { register: (id: string, cls: unknown, o: unknown) => void }) => {
  r.register('coin', HeadlessSymbol, {});
  r.register('grand', HeadlessSymbol, {});
};

function make(cellZIndex?: BoardCellZIndexResolver) {
  const ticker = new FakeTicker();
  const grid = new BoardGrid({
    cols: 3, rows: 2, cellSize: 40, symbols, cellZIndex,
    ticker: ticker as unknown as Ticker,
  });
  return { grid, ticker, destroy: () => { grid.destroy(); ticker.destroy(); } };
}

describe('BoardGrid cellZIndex', () => {
  it('leaves the lifted layer in attach order without a resolver', () => {
    const { grid, destroy } = make();
    expect(grid.liftedLayer.sortableChildren).toBe(false);
    for (const cell of grid.cells()) {
      expect(grid.reelAt(cell).viewport.unmaskedContainer.zIndex).toBe(0);
    }
    destroy();
  });

  it('sorts the lifted layer by the resolver, asked with the board coordinate', () => {
    const seen: BoardCellZIndexContext[] = [];
    const { grid, destroy } = make((ctx) => {
      seen.push(ctx);
      return ctx.cell.cell * ctx.cols + ctx.cell.reel;
    });
    expect(grid.liftedLayer.sortableChildren).toBe(true);
    for (const cell of grid.cells()) {
      expect(grid.reelAt(cell).viewport.unmaskedContainer.zIndex).toBe(cell.cell * 3 + cell.reel);
    }
    const first = seen.find((c) => c.cell.reel === 1 && c.cell.cell === 0)!;
    expect(first).toMatchObject({ symbolId: 'empty', cols: 3, rows: 2, atRest: true, attachOrder: 2 });
    destroy();
  });

  it('re-asks on place() with the new symbol', () => {
    const { grid, destroy } = make(({ symbolId, attachOrder }) => (symbolId === 'grand' ? 100 : 0) + attachOrder);
    const cell = { reel: 2, cell: 1 };
    expect(grid.reelAt(cell).viewport.unmaskedContainer.zIndex).toBe(5);
    grid.place(cell, 'grand');
    expect(grid.reelAt(cell).viewport.unmaskedContainer.zIndex).toBe(105);
    destroy();
  });

  it('re-asks when a cell lands, before onLanded', async () => {
    const { grid, ticker, destroy } = make(({ symbolId }) => (symbolId === 'grand' ? 9 : 1));
    const cell = { reel: 0, cell: 0 };
    let zAtLanded = -1;
    const wave = grid.spinCells([{ cell, id: 'grand' }], () => {
      zAtLanded = grid.reelAt(cell).viewport.unmaskedContainer.zIndex;
    });
    grid.skipSpinning();
    for (let i = 0; i < 50; i++) {
      ticker.tick(16);
      await new Promise((r) => setTimeout(r, 0));
    }
    await wave;
    expect(zAtLanded).toBe(9);
    destroy();
  });

  it('reaches the cells through HoldAndWinBuilder.cellZIndex and liftedLayer', () => {
    const ticker = new FakeTicker();
    const board = new HoldAndWinBuilder()
      .grid(2, 2)
      .cellSize(40)
      .symbols(symbols)
      .cellZIndex(({ cell }) => 10 + cell.cell)
      .ticker(ticker as unknown as Ticker)
      .build();
    expect(board.liftedLayer.sortableChildren).toBe(true);
    expect(board.reelAt({ reel: 1, cell: 1 }).viewport.unmaskedContainer.zIndex).toBe(11);
    expect(() => new HoldAndWinBuilder().cellZIndex('x' as unknown as BoardCellZIndexResolver)).toThrow(/function/);
    board.destroy();
    ticker.destroy();
  });
});
