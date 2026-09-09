/**
 * `BoardGrid.lift()` promotes one cell's lifted art above every other cell's
 * for the length of a beat, on a second `RenderLayer` rather than a bigger
 * `zIndex` - so `refreshCellZIndex()` can keep rewriting the lifted cell's
 * order underneath the lift without disturbing it, and the release restores
 * the cell's place without recomputing anything.
 */
import type { Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { BoardGrid } from '../../src/board/BoardGrid.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { BoardCell, BoardCellZIndexResolver } from '../../src/board/BoardGrid.js';

const symbols = (r: { register: (id: string, cls: unknown, o: unknown) => void }) => {
  r.register('coin', HeadlessSymbol, {});
  r.register('cannon', HeadlessSymbol, {});
};

function make(cellZIndex?: BoardCellZIndexResolver) {
  const ticker = new FakeTicker();
  const grid = new BoardGrid({
    cols: 3, rows: 2, cellSize: 40, symbols, cellZIndex,
    ticker: ticker as unknown as Ticker,
  });
  return { grid, destroy: () => { grid.destroy(); ticker.destroy(); } };
}

/** The container `lift` moves between layers: the cell's lifted art. */
const art = (grid: BoardGrid, cell: BoardCell) => grid.reelAt(cell).viewport.unmaskedContainer;
/** The layer a cell currently renders its lifted art in. */
const layerOf = (grid: BoardGrid, cell: BoardCell) => art(grid, cell).parentRenderLayer;

describe('BoardGrid.lift', () => {
  it('is inert until called: every cell stays in the shared lifted layer', () => {
    const { grid, destroy } = make();
    expect(grid.liftedCells).toEqual([]);
    for (const cell of grid.cells()) expect(layerOf(grid, cell)).toBe(grid.liftedLayer);
    destroy();
  });

  it('moves the cell to a layer above the shared one, and back on release', () => {
    const { grid, destroy } = make();
    const cell = { reel: 1, cell: 0 };
    const shared = grid.liftedLayer;

    const release = grid.lift(cell);
    const promoted = layerOf(grid, cell);
    expect(promoted).not.toBe(shared);
    expect(grid.liftedCells).toEqual([cell]);
    // Above, not beside: the promoted layer is added to the container after
    // the shared one, so it draws later.
    expect(grid.container.getChildIndex(promoted!)).toBeGreaterThan(
      grid.container.getChildIndex(shared),
    );
    // Every other cell is untouched.
    for (const other of grid.cells()) {
      if (other.reel === cell.reel && other.cell === cell.cell) continue;
      expect(layerOf(grid, other)).toBe(shared);
    }

    release();
    expect(layerOf(grid, cell)).toBe(shared);
    expect(grid.liftedCells).toEqual([]);
    destroy();
  });

  it('reference-counts overlapping lifts of one cell', () => {
    const { grid, destroy } = make();
    const cell = { reel: 2, cell: 1 };
    const shared = grid.liftedLayer;

    const first = grid.lift(cell);
    const second = grid.lift(cell);
    expect(grid.liftedCells).toEqual([cell]);

    first();
    expect(layerOf(grid, cell)).not.toBe(shared);
    expect(grid.liftedCells).toEqual([cell]);

    second();
    expect(layerOf(grid, cell)).toBe(shared);
    expect(grid.liftedCells).toEqual([]);
    destroy();
  });

  it('makes a repeated release a no-op, not an underflow', () => {
    const { grid, destroy } = make();
    const cell = { reel: 0, cell: 0 };
    const outer = grid.lift(cell);
    const inner = grid.lift(cell);
    inner();
    inner();
    inner();
    // The outer lift still holds it: a double release must not drop it.
    expect(layerOf(grid, cell)).not.toBe(grid.liftedLayer);
    outer();
    expect(layerOf(grid, cell)).toBe(grid.liftedLayer);
    destroy();
  });

  it('keeps lift order in liftedCells, first lift wins', () => {
    const { grid, destroy } = make();
    const a = { reel: 2, cell: 0 };
    const b = { reel: 0, cell: 1 };
    const releaseA = grid.lift(a);
    grid.lift(b);
    grid.lift(a); // second lift of `a` must not move it to the back
    expect(grid.liftedCells).toEqual([a, b]);
    releaseA();
    expect(grid.liftedCells).toEqual([a, b]);
    destroy();
  });

  it('survives refreshCellZIndex, and the release recomputes nothing', () => {
    const resolver = vi.fn<BoardCellZIndexResolver>(({ attachOrder }) => attachOrder);
    const { grid, destroy } = make(resolver);
    const cell = { reel: 0, cell: 1 };
    const release = grid.lift(cell);
    const promoted = layerOf(grid, cell);

    // A landing or a setSymbolAt elsewhere on the board mid-lift.
    resolver.mockClear();
    grid.place({ reel: 2, cell: 1 }, 'coin');
    expect(resolver).toHaveBeenCalled();
    expect(layerOf(grid, cell)).toBe(promoted);
    // The refresh keeps ordering the lifted cell for the moment it comes back.
    expect(art(grid, cell).zIndex).toBe(1);

    resolver.mockClear();
    release();
    expect(resolver).not.toHaveBeenCalled();
    expect(layerOf(grid, cell)).toBe(grid.liftedLayer);
    expect(art(grid, cell).zIndex).toBe(1);
    destroy();
  });

  it('sorts several lifted cells by the same cellZIndex as at rest', () => {
    const { grid, destroy } = make(({ cell, cols }) => cell.cell * cols + cell.reel);
    const low = { reel: 0, cell: 0 };
    const high = { reel: 1, cell: 1 };
    grid.lift(low);
    grid.lift(high);
    const promoted = layerOf(grid, low)!;
    expect(promoted.sortableChildren).toBe(true);
    promoted.sortRenderLayerChildren();
    expect(promoted.renderLayerChildren).toEqual([art(grid, low), art(grid, high)]);
    destroy();
  });

  it('leaves the promoted layer unsortable when no resolver orders the board', () => {
    const { grid, destroy } = make();
    grid.lift({ reel: 0, cell: 0 });
    expect(layerOf(grid, { reel: 0, cell: 0 })!.sortableChildren).toBe(false);
    destroy();
  });

  it('releases every outstanding lift on releaseAllLifts', () => {
    const { grid, destroy } = make();
    const a = { reel: 0, cell: 0 };
    const b = { reel: 1, cell: 1 };
    const releaseA = grid.lift(a);
    grid.lift(a);
    grid.lift(b);
    grid.releaseAllLifts();
    expect(grid.liftedCells).toEqual([]);
    expect(layerOf(grid, a)).toBe(grid.liftedLayer);
    expect(layerOf(grid, b)).toBe(grid.liftedLayer);
    // A release handed out before the sweep stays safe to call.
    expect(() => releaseA()).not.toThrow();
    expect(grid.liftedCells).toEqual([]);
    destroy();
  });

  it('throws for a cell outside the grid', () => {
    const { grid, destroy } = make();
    expect(() => grid.lift({ reel: 9, cell: 0 })).toThrow(/outside the 3x2 grid/);
    destroy();
  });

  it('is a no-op on a destroyed board, and its release stays safe', () => {
    const { grid, destroy } = make();
    destroy();
    const release = grid.lift({ reel: 0, cell: 0 });
    expect(grid.liftedCells).toEqual([]);
    expect(() => release()).not.toThrow();
  });
});
