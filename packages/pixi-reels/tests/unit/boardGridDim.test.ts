/**
 * `BoardGrid.dim()` is the board-level counterpart to a ReelSet spotlight's
 * dim, and the partner of `lift()`: one cell forward, the rest back. The dim
 * draws above the cells' lifted art - so a dimmed cell's coin goes down with
 * it - and below the promoted layer, so a lifted cell stays out in front.
 */
import { Graphics } from 'pixi.js';
import type { RenderLayer, Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { BoardGrid, DEFAULT_DIM_FADE_MS } from '../../src/board/BoardGrid.js';
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
  /** Run the dim fade to completion (and a little past it). */
  const settle = (ms = 400) => { ticker.tick(ms); };
  return { grid, ticker, settle, destroy: () => { grid.destroy(); ticker.destroy(); } };
}

/**
 * The container the dim rectangles live in - added right after the lifted
 * layer, and empty between dims, so it has to be found by position rather
 * than by what is in it. Its `alpha` is the fade.
 */
const host = (grid: BoardGrid) =>
  grid.container.children[grid.container.children.indexOf(grid.liftedLayer as never) + 1];

/** The layer the dim rectangles draw through. */
const dimLayer = (grid: BoardGrid): RenderLayer =>
  grid.container.children.find(
    (c) => 'renderLayerChildren' in c && c !== grid.liftedLayer,
  ) as unknown as RenderLayer;

/** Rectangles currently drawn. */
const rects = (grid: BoardGrid) => host(grid).children.filter((c) => c instanceof Graphics);

describe('BoardGrid.dim', () => {
  it('is inert until called', () => {
    const { grid, destroy } = make();
    expect(grid.dimmedCells).toEqual([]);
    expect(rects(grid)).toEqual([]);
    destroy();
  });

  it('covers every cell but the excepted ones, and clears on release', () => {
    const { grid, settle, destroy } = make();
    const spared = { reel: 1, cell: 0 };
    const undim = grid.dim({ except: [spared] });
    expect(grid.dimmedCells).toHaveLength(5);
    expect(grid.dimmedCells).not.toContainEqual(spared);
    expect(rects(grid)).toHaveLength(5);

    undim();
    // Released at once as far as the board is concerned; the fade is the
    // only thing still on screen.
    expect(grid.dimmedCells).toEqual([]);
    settle();
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
    const { grid, settle, destroy } = make();
    const undim = grid.dim({ amount: 0.8, fade: 0 });
    expect(rects(grid).every((r) => r.alpha === 0.8)).toBe(true);
    undim();
    settle();
    grid.dim({ fade: 0 });
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
    // Legal again immediately, mid fade out - the fade is presentation.
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
    const undim = grid.dim({ fade: 0 });
    grid.clearDim();
    expect(grid.dimmedCells).toEqual([]);
    expect(() => undim()).not.toThrow();
    expect(() => grid.dim()).not.toThrow();
    destroy();
  });

  it('fades in over the default and holds at full once there', () => {
    const { grid, ticker, destroy } = make();
    grid.dim();
    expect(host(grid).alpha).toBe(0);
    ticker.tick(DEFAULT_DIM_FADE_MS / 2);
    expect(host(grid).alpha).toBeCloseTo(0.5, 5);
    ticker.tick(DEFAULT_DIM_FADE_MS / 2);
    expect(host(grid).alpha).toBe(1);
    // No fade left running: further frames must not drift it.
    ticker.tick(500);
    expect(host(grid).alpha).toBe(1);
    destroy();
  });

  it('cuts instantly with fade 0, both ways', () => {
    const { grid, destroy } = make();
    const undim = grid.dim({ fade: 0 });
    expect(host(grid).alpha).toBe(1);
    undim();
    expect(host(grid).alpha).toBe(0);
    expect(rects(grid)).toEqual([]);
    destroy();
  });

  it('fades out from wherever the fade in got to, in proportion', () => {
    const { grid, ticker, destroy } = make();
    const undim = grid.dim({ fade: 200 });
    ticker.tick(50); // a quarter of the way in
    expect(host(grid).alpha).toBeCloseTo(0.25, 5);

    undim();
    // A quarter of the distance left, so a quarter of the duration.
    ticker.tick(25);
    expect(host(grid).alpha).toBeCloseTo(0.125, 5);
    ticker.tick(25);
    expect(host(grid).alpha).toBe(0);
    expect(rects(grid)).toEqual([]);
    destroy();
  });

  it('continues from what is on screen when a new dim interrupts a fade out', () => {
    const { grid, ticker, destroy } = make();
    const undim = grid.dim({ fade: 200 });
    ticker.tick(200);
    undim();
    ticker.tick(100); // half way back out
    expect(host(grid).alpha).toBeCloseTo(0.5, 5);

    grid.dim({ except: [{ reel: 0, cell: 0 }], fade: 200 });
    // No jump to 0: the new dim picks up the alpha that is already there.
    expect(host(grid).alpha).toBeCloseTo(0.5, 5);
    expect(rects(grid)).toHaveLength(5);
    ticker.tick(100);
    expect(host(grid).alpha).toBe(1);
    destroy();
  });

  it('rejects a fade that is not a finite count of milliseconds', () => {
    const { grid, destroy } = make();
    expect(() => grid.dim({ fade: -1 })).toThrow(/finite count of milliseconds/);
    expect(() => grid.dim({ fade: Number.POSITIVE_INFINITY })).toThrow(/finite count of milliseconds/);
    expect(grid.dimmedCells).toEqual([]);
    destroy();
  });

  it('cuts a fade short on clearDim rather than leaving it running', () => {
    const { grid, ticker, destroy } = make();
    grid.dim({ fade: 400 });
    ticker.tick(100);
    grid.clearDim();
    expect(host(grid).alpha).toBe(0);
    expect(rects(grid)).toEqual([]);
    ticker.tick(400);
    expect(host(grid).alpha).toBe(0);
    destroy();
  });

  it('leaves no ticker callback behind after destroy', () => {
    const { grid, ticker } = make();
    grid.dim({ fade: 400 });
    ticker.tick(100);
    grid.destroy();
    expect(() => ticker.tick(400)).not.toThrow();
    ticker.destroy();
  });

  it('is a no-op on a destroyed board', () => {
    const { grid, destroy } = make();
    destroy();
    const undim = grid.dim();
    expect(grid.dimmedCells).toEqual([]);
    expect(() => undim()).not.toThrow();
  });
});
