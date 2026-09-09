/**
 * `BoardGrid.dimSymbols()` is `dim()` on a different channel: it darkens the
 * ART and leaves the cell alone. The interesting part is not the tint, it is
 * the pool - `deactivate()` resets alpha, scale, rotation and filters but NOT
 * tint, so a symbol released while dark would stay dark in whatever cell
 * reuses it next.
 */
import { Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { BoardGrid, DEFAULT_DIM_AMOUNT, DEFAULT_DIM_FADE_MS } from '../../src/board/BoardGrid.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { BoardCell } from '../../src/board/BoardGrid.js';

const NO_TINT = 0xffffff;
/** What `amount` multiplies the art down to. 0.5 is the classic 0x808080. */
const greyFor = (amount: number) => {
  const c = Math.round(255 * (1 - amount));
  return (c << 16) | (c << 8) | c;
};

const symbols = (r: { register: (id: string, cls: unknown, o: unknown) => void }) => {
  r.register('coin', HeadlessSymbol, {});
  r.register('grand', HeadlessSymbol, {});
  r.register('empty', HeadlessSymbol, {});
};

function make() {
  const ticker = new FakeTicker();
  const grid = new BoardGrid({
    cols: 3, rows: 2, cellSize: 40, gap: 0, symbols,
    ticker: ticker as unknown as Ticker,
  });
  const settle = (ms = 400) => { ticker.tick(ms); };
  return { grid, ticker, settle, destroy: () => { grid.destroy(); ticker.destroy(); } };
}

const tintAt = (grid: BoardGrid, cell: BoardCell) => grid.symbolAt(cell).view.tint;
/** The container `dim()` puts its rectangles in - must stay empty here. */
const cellDimHost = (grid: BoardGrid) =>
  grid.container.children[grid.container.children.indexOf(grid.liftedLayer as never) + 1];

describe('BoardGrid.dimSymbols', () => {
  it('is inert until called', () => {
    const { grid, destroy } = make();
    expect(grid.dimmedSymbolCells).toEqual([]);
    for (const cell of grid.cells()) expect(tintAt(grid, cell)).toBe(NO_TINT);
    destroy();
  });

  it('tints every symbol but the excepted ones, and clears on release', () => {
    const { grid, settle, destroy } = make();
    const spared = { reel: 1, cell: 0 };
    const undim = grid.dimSymbols({ except: [spared], fade: 0 });

    expect(grid.dimmedSymbolCells).toHaveLength(5);
    expect(grid.dimmedSymbolCells).not.toContainEqual(spared);
    expect(tintAt(grid, spared)).toBe(NO_TINT);
    for (const cell of grid.cells()) {
      if (cell.reel === spared.reel && cell.cell === spared.cell) continue;
      expect(tintAt(grid, cell)).toBe(greyFor(DEFAULT_DIM_AMOUNT));
    }

    undim();
    settle();
    expect(grid.dimmedSymbolCells).toEqual([]);
    for (const cell of grid.cells()) expect(tintAt(grid, cell)).toBe(NO_TINT);
    destroy();
  });

  it('leaves the cell alone - no rectangle, unlike dim()', () => {
    const { grid, destroy } = make();
    grid.dimSymbols({ fade: 0 });
    expect(cellDimHost(grid).children.filter((c) => c instanceof Graphics)).toEqual([]);
    expect(grid.dimmedCells).toEqual([]);
    destroy();
  });

  it('takes the strength from amount: 0 leaves the art, 1 takes it to black', () => {
    const { grid, settle, destroy } = make();
    const cell = { reel: 0, cell: 0 };

    let undim = grid.dimSymbols({ amount: 1, fade: 0 });
    expect(tintAt(grid, cell)).toBe(0x000000);
    undim(); settle();

    undim = grid.dimSymbols({ amount: 0.25, fade: 0 });
    expect(tintAt(grid, cell)).toBe(greyFor(0.25));
    undim(); settle();

    undim = grid.dimSymbols({ amount: 0, fade: 0 });
    expect(tintAt(grid, cell)).toBe(NO_TINT);
    destroy();
  });

  it('fades the strength in over the default, and holds there', () => {
    const { grid, ticker, destroy } = make();
    const cell = { reel: 2, cell: 1 };
    grid.dimSymbols({ amount: 1 });
    expect(tintAt(grid, cell)).toBe(NO_TINT);

    ticker.tick(DEFAULT_DIM_FADE_MS / 2);
    expect(tintAt(grid, cell)).toBe(greyFor(0.5));
    ticker.tick(DEFAULT_DIM_FADE_MS / 2);
    expect(tintAt(grid, cell)).toBe(0x000000);
    ticker.tick(500);
    expect(tintAt(grid, cell)).toBe(0x000000);
    destroy();
  });

  it('keeps a dimmed cell dim when its symbol swaps under it', () => {
    const { grid, destroy } = make();
    const cell = { reel: 0, cell: 1 };
    const before = grid.symbolAt(cell);
    grid.dimSymbols({ fade: 0 });
    expect(before.view.tint).toBe(greyFor(DEFAULT_DIM_AMOUNT));

    grid.place(cell, 'grand');
    const after = grid.symbolAt(cell);
    expect(after).not.toBe(before);
    // The arrival is dark...
    expect(after.view.tint).toBe(greyFor(DEFAULT_DIM_AMOUNT));
    // ...and the one that left is clean, so the pool cannot hand the tint on.
    expect(before.view.tint).toBe(NO_TINT);
    destroy();
  });

  it('does not tint a symbol that lands in an excepted cell', () => {
    const { grid, destroy } = make();
    const spared = { reel: 2, cell: 0 };
    grid.dimSymbols({ except: [spared], fade: 0 });
    grid.place(spared, 'grand');
    expect(tintAt(grid, spared)).toBe(NO_TINT);
    destroy();
  });

  it('clears the tint of a symbol that swapped in mid-dim, on release', () => {
    const { grid, settle, destroy } = make();
    const cell = { reel: 1, cell: 1 };
    const undim = grid.dimSymbols({ fade: 0 });
    grid.place(cell, 'grand');
    const swapped = grid.symbolAt(cell);
    expect(swapped.view.tint).toBe(greyFor(DEFAULT_DIM_AMOUNT));

    undim();
    settle();
    expect(swapped.view.tint).toBe(NO_TINT);
    destroy();
  });

  it('runs alongside the cell dim without either cancelling the other', () => {
    const { grid, ticker, destroy } = make();
    const cell = { reel: 0, cell: 0 };
    grid.dim({ amount: 0.4 });
    grid.dimSymbols({ amount: 1 });

    ticker.tick(DEFAULT_DIM_FADE_MS / 2);
    expect(cellDimHost(grid).alpha).toBeCloseTo(0.5, 5);
    expect(tintAt(grid, cell)).toBe(greyFor(0.5));

    ticker.tick(DEFAULT_DIM_FADE_MS / 2);
    expect(cellDimHost(grid).alpha).toBe(1);
    expect(tintAt(grid, cell)).toBe(0x000000);
    destroy();
  });

  it('refuses a second symbol dim rather than silently replacing the first', () => {
    const { grid, destroy } = make();
    const undim = grid.dimSymbols();
    expect(() => grid.dimSymbols({ except: [{ reel: 0, cell: 0 }] })).toThrow(/already up/);
    undim();
    expect(() => grid.dimSymbols()).not.toThrow();
    destroy();
  });

  it('continues from the strength on screen when a new dim interrupts a fade out', () => {
    const { grid, ticker, destroy } = make();
    const cell = { reel: 0, cell: 0 };
    const undim = grid.dimSymbols({ amount: 1, fade: 200 });
    ticker.tick(200);
    undim();
    ticker.tick(100); // half way back out
    expect(tintAt(grid, cell)).toBe(greyFor(0.5));

    grid.dimSymbols({ amount: 1, fade: 200 });
    // No jump back to white: the new dim picks up where the fade out got to.
    expect(tintAt(grid, cell)).toBe(greyFor(0.5));
    ticker.tick(100);
    expect(tintAt(grid, cell)).toBe(0x000000);
    destroy();
  });

  it('makes a repeated release a no-op', () => {
    const { grid, settle, destroy } = make();
    const undim = grid.dimSymbols({ fade: 0 });
    undim();
    undim();
    settle();
    expect(grid.dimmedSymbolCells).toEqual([]);
    destroy();
  });

  it('rejects an amount or fade out of range, and a cell outside the grid', () => {
    const { grid, destroy } = make();
    expect(() => grid.dimSymbols({ amount: 1.5 })).toThrow(/within \[0, 1\]/);
    expect(() => grid.dimSymbols({ fade: -1 })).toThrow(/finite count of milliseconds/);
    expect(() => grid.dimSymbols({ except: [{ reel: 9, cell: 0 }] })).toThrow(/outside the 3x2 grid/);
    expect(grid.dimmedSymbolCells).toEqual([]);
    expect(() => grid.dimSymbols()).not.toThrow();
    destroy();
  });

  it('clears every tint and stops watching swaps on clearSymbolDim', () => {
    const { grid, ticker, destroy } = make();
    const cell = { reel: 1, cell: 0 };
    const undim = grid.dimSymbols({ amount: 1, fade: 400 });
    ticker.tick(200);
    grid.clearSymbolDim();

    for (const c of grid.cells()) expect(tintAt(grid, c)).toBe(NO_TINT);
    expect(grid.dimmedSymbolCells).toEqual([]);
    // The fade is gone, not merely detached from the tints.
    ticker.tick(400);
    for (const c of grid.cells()) expect(tintAt(grid, c)).toBe(NO_TINT);
    // A swap must no longer be re-tinted by a listener nobody removed.
    grid.place(cell, 'grand');
    expect(tintAt(grid, cell)).toBe(NO_TINT);
    expect(() => undim()).not.toThrow();
    destroy();
  });

  it('cleans the tint at the pool boundary, so a recycled symbol arrives white', () => {
    const { grid, destroy } = make();
    const cell = { reel: 0, cell: 0 };
    const dimmed = grid.symbolAt(cell);
    grid.dimSymbols({ amount: 1, fade: 0 });
    expect(dimmed.view.tint).toBe(0x000000);

    // Straight through the pool: `deactivate()` has to clear the tint, or the
    // instance carries black into whatever cell reuses it next. This is the
    // belt to the board's braces - it holds for a tint the GAME wrote too,
    // which the board's own bookkeeping knows nothing about.
    dimmed.deactivate();
    expect(dimmed.view.tint).toBe(NO_TINT);

    dimmed.view.tint = 0x123456;
    dimmed.activate('coin');
    expect(dimmed.view.tint).toBe(NO_TINT);
    destroy();
  });

  it('cleans a same-id in-place swap, which never touches the pool', () => {
    const { grid, destroy } = make();
    const cell = { reel: 2, cell: 1 };
    grid.place(cell, 'coin');
    const undim = grid.dimSymbols({ amount: 1, fade: 0 });
    const symbol = grid.symbolAt(cell);
    expect(symbol.view.tint).toBe(0x000000);

    undim();
    // Same id: `_replaceSymbol` reuses the instance without deactivating it,
    // so that path has to clear the tint on its own.
    grid.place(cell, 'coin');
    expect(grid.symbolAt(cell)).toBe(symbol);
    expect(symbol.view.tint).toBe(NO_TINT);
    destroy();
  });

  it('leaves no ticker callback behind after destroy', () => {
    const { grid, ticker } = make();
    grid.dimSymbols({ fade: 400 });
    ticker.tick(100);
    grid.destroy();
    expect(() => ticker.tick(400)).not.toThrow();
    ticker.destroy();
  });

  it('is a no-op on a destroyed board', () => {
    const { grid, destroy } = make();
    destroy();
    const undim = grid.dimSymbols();
    expect(grid.dimmedSymbolCells).toEqual([]);
    expect(() => undim()).not.toThrow();
  });
});
