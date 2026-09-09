/**
 * A game holds a `HoldAndWinBoard`, not the `BoardGrid` under it, so the lift
 * and the order-refresh have to be reachable from there - and a feature that
 * ends mid-animation must not leave a cell stuck in front.
 */
import type { Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { HoldAndWinBuilder } from '../../src/board/HoldAndWinBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { HwCell } from '../../src/board/HwTypes.js';
import type { BoardCellZIndexResolver } from '../../src/board/BoardGrid.js';

/** Slam the wave and pump frames until the awaited respin resolves. */
async function settle<T>(
  board: ReturnType<typeof make>['board'],
  ticker: FakeTicker,
  p: Promise<T>,
): Promise<T> {
  let done = false;
  void p.then(() => { done = true; }, () => { done = true; });
  board.skip();
  for (let i = 0; i < 400 && !done; i++) {
    ticker.tick(16);
    await new Promise((r) => setTimeout(r, 0));
  }
  return p;
}

function make(cellZIndex?: BoardCellZIndexResolver) {
  const ticker = new FakeTicker();
  const builder = new HoldAndWinBuilder()
    .grid(3, 2)
    .cellSize(40)
    .symbols((r) => {
      r.register('coin', HeadlessSymbol, {});
      r.register('empty', HeadlessSymbol, {});
    })
    .respins(3)
    .ticker(ticker as unknown as Ticker);
  if (cellZIndex) builder.cellZIndex(cellZIndex);
  const board = builder.build();
  return { board, ticker, destroy: () => { board.destroy(); ticker.destroy(); } };
}

const layerOf = (board: ReturnType<typeof make>['board'], cell: HwCell) =>
  board.reelAt(cell).viewport.unmaskedContainer.parentRenderLayer;

describe('HoldAndWinBoard lift passthrough', () => {
  it('lifts and releases through the board a game actually holds', () => {
    const { board, destroy } = make();
    const cell = { reel: 1, cell: 1 };
    const release = board.lift(cell);
    expect(board.liftedCells).toEqual([cell]);
    expect(layerOf(board, cell)).not.toBe(board.liftedLayer);
    release();
    expect(board.liftedCells).toEqual([]);
    expect(layerOf(board, cell)).toBe(board.liftedLayer);
    destroy();
  });

  it('drops every lift on reset', () => {
    const { board, destroy } = make();
    board.lift({ reel: 0, cell: 0 });
    board.lift({ reel: 2, cell: 1 });
    board.enter([{ cell: { reel: 0, cell: 0 }, id: 'coin' }]);
    board.reset();
    expect(board.liftedCells).toEqual([]);
    for (const cell of [{ reel: 0, cell: 0 }, { reel: 2, cell: 1 }]) {
      expect(layerOf(board, cell)).toBe(board.liftedLayer);
    }
    destroy();
  });

  it('does NOT drop a lift on respin - a presentation may span one', async () => {
    const { board, ticker, destroy } = make();
    const cell = { reel: 0, cell: 0 };
    board.enter([{ cell, id: 'coin' }]);
    board.lift(cell);
    await settle(board, ticker, board.respin([]));
    expect(board.liftedCells).toEqual([cell]);
    expect(layerOf(board, cell)).not.toBe(board.liftedLayer);
    destroy();
  });

  it('keeps the lift through a setSymbolAt on another cell', () => {
    const resolver = vi.fn<BoardCellZIndexResolver>(({ attachOrder }) => attachOrder);
    const { board, destroy } = make(resolver);
    const lifted = { reel: 0, cell: 1 };
    board.enter([{ cell: lifted, id: 'coin' }, { cell: { reel: 2, cell: 0 }, id: 'coin' }]);
    board.lift(lifted);
    const promoted = layerOf(board, lifted);

    resolver.mockClear();
    board.setSymbolAt({ reel: 2, cell: 0 }, 'coin');
    expect(resolver).toHaveBeenCalled();
    expect(layerOf(board, lifted)).toBe(promoted);
    destroy();
  });

  it('exposes refreshCellZIndex for state the board does not watch', () => {
    let bonus = 0;
    const resolver = vi.fn<BoardCellZIndexResolver>(({ attachOrder }) => attachOrder + bonus);
    const { board, destroy } = make(resolver);
    const cell = { reel: 1, cell: 0 };
    const art = board.reelAt(cell).viewport.unmaskedContainer;
    const before = art.zIndex;

    bonus = 100;
    expect(art.zIndex).toBe(before); // nothing the board watches changed
    board.refreshCellZIndex();
    expect(art.zIndex).toBe(before + 100);
    destroy();
  });

  it('dims every cell but the excepted ones, and drops it on reset', () => {
    const { board, destroy } = make();
    const spared = { reel: 1, cell: 1 };
    board.enter([{ cell: spared, id: 'coin' }]);
    board.dim({ except: [spared], amount: 0.7 });
    expect(board.dimmedCells).toHaveLength(5);
    expect(board.dimmedCells).not.toContainEqual(spared);

    board.reset();
    expect(board.dimmedCells).toEqual([]);
    // The reset cleared it, so a fresh dim must be allowed.
    expect(() => board.dim()).not.toThrow();
    destroy();
  });

  it('drops every lift on destroy', () => {
    const { board, destroy } = make();
    const release = board.lift({ reel: 0, cell: 0 });
    destroy();
    expect(board.liftedCells).toEqual([]);
    expect(() => release()).not.toThrow();
  });
});
