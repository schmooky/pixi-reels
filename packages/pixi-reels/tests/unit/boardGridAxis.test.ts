/**
 * ADR 016 section 7 listed sideways Hold & Win cells as unlocked by the axis
 * work, but `BoardGrid` built every cell with a bare `ReelSetBuilder` and
 * neither it nor `HoldAndWinBuilder` exposed an axis, so a board's coins
 * always scrolled in from above.
 */
import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { BoardGrid } from '../../src/board/BoardGrid.js';
import { HoldAndWinBuilder } from '../../src/board/HoldAndWinBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

const registerCoin = (r: { register: (id: string, cls: unknown, o: unknown) => void }) =>
  r.register('coin', HeadlessSymbol, {});

describe('BoardGrid cell axis', () => {
  it('defaults every cell to vertical / forward', () => {
    const ticker = new FakeTicker();
    const grid = new BoardGrid({
      cols: 2, rows: 2, cellSize: 40,
      symbols: registerCoin, ticker: ticker as unknown as Ticker,
    });
    for (const cell of grid.cells()) {
      const axis = grid.reelAt(cell).reels[0].axis;
      expect(axis.orientation).toBe('vertical');
      expect(axis.direction).toBe('forward');
    }
    grid.destroy();
    ticker.destroy();
  });

  it('applies orientation and direction to every cell', () => {
    const ticker = new FakeTicker();
    const grid = new BoardGrid({
      cols: 2, rows: 3, cellSize: 40,
      orientation: 'horizontal', direction: 'reverse',
      symbols: registerCoin, ticker: ticker as unknown as Ticker,
    });
    // Board layout stays cols x rows; only the strip inside each cell turns.
    expect(grid.cells()).toHaveLength(6);
    for (const cell of grid.cells()) {
      const axis = grid.reelAt(cell).reels[0].axis;
      expect(axis.orientation).toBe('horizontal');
      expect(axis.direction).toBe('reverse');
      expect(axis.mainProp).toBe('x');
      expect(axis.feedEdge).toBe('end');
    }
    grid.destroy();
    ticker.destroy();
  });

  it('HoldAndWinBuilder.axis() reaches the cells', () => {
    const ticker = new FakeTicker();
    const board = new HoldAndWinBuilder()
      .grid(2, 2)
      .cellSize(40)
      .axis('horizontal', 'reverse')
      .symbols(registerCoin)
      .ticker(ticker as unknown as Ticker)
      .build();
    for (const cell of board.freeCells) {
      const axis = board.reelAt(cell).reels[0].axis;
      expect(axis.orientation).toBe('horizontal');
      expect(axis.direction).toBe('reverse');
    }
    board.destroy();
    ticker.destroy();
  });
});
