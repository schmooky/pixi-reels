/**
 * The lock animation, per coin and sequenced after the landing. With
 * `lockAnimation('win')` the board fired `playWin()` on the lock, which lands
 * a bounce after the reel is on its frame - right on top of the landing beat
 * a Spine symbol had started from `onReelLanded`, so the landing never showed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HoldAndWinBuilder } from '../../src/board/HoldAndWinBuilder.js';
import type { HoldAndWinBoard } from '../../src/board/HoldAndWinBoard.js';
import type { HwCell, HwLockAnimationRule } from '../../src/board/HwTypes.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

/** Starts a landing beat on land, resolved by the test; counts the board's calls. */
class BeatSymbol extends HeadlessSymbol {
  static wins: string[] = [];
  static landings = 0;
  static pending: BeatSymbol[] = [];
  resolveBeat: (() => void) | null = null;
  override onReelLanded(): void {
    void this.trackLanding(new Promise<void>((resolve) => { this.resolveBeat = resolve; }));
    BeatSymbol.pending.push(this);
  }
  override async playWin(): Promise<void> {
    BeatSymbol.wins.push(this.symbolId);
  }
  override async playLanding(): Promise<void> {
    BeatSymbol.landings += 1;
  }
}

const A: HwCell = { reel: 0, cell: 0 };
const B: HwCell = { reel: 1, cell: 0 };
const C: HwCell = { reel: 0, cell: 1 };
const coin = (cell: HwCell, id = 'coin') => ({ cell, id, data: { value: 1 } });

function build(lock?: HwLockAnimationRule<{ value: number }>) {
  const ticker = new FakeTicker();
  const builder = new HoldAndWinBuilder<{ value: number }>()
    .grid(2, 2)
    .cellSize(40)
    .symbols((r) => {
      r.register('coin', BeatSymbol, {});
      r.register('collector', BeatSymbol, {});
    })
    .weights({ coin: 1, empty: 1 })
    .stagger(() => 0)
    .ticker(ticker as unknown as Ticker);
  if (lock) builder.lockAnimation(lock);
  return { board: builder.build(), ticker };
}

async function settle<T>(board: HoldAndWinBoard<{ value: number }>, ticker: FakeTicker, p: Promise<T>): Promise<T> {
  let done = false;
  void p.then(() => { done = true; }, () => { done = true; });
  board.skip();
  for (let i = 0; i < 400 && !done; i++) {
    ticker.tick(16);
    await new Promise((r) => setTimeout(r, 0));
  }
  return p;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  BeatSymbol.wins = [];
  BeatSymbol.landings = 0;
  BeatSymbol.pending = [];
});

describe('HoldAndWinBoard lock animation rule', () => {
  it("'win' waits for the symbol's own landing beat instead of stomping it", async () => {
    const { board, ticker } = build('win');
    board.enter([coin(A)]);
    await settle(board, ticker, board.respin([coin(B)]));
    // The wave settled, the lock fired, but the beat is still running.
    expect(BeatSymbol.wins).toEqual([]);
    const landed = BeatSymbol.pending.find((s) => s.resolveBeat)!;
    landed.resolveBeat!();
    await flush();
    expect(BeatSymbol.wins).toEqual(['coin']);
    board.destroy();
    ticker.destroy();
  });

  it("'landing' does not replay a beat the symbol already started", async () => {
    const { board, ticker } = build('landing');
    board.enter([coin(A)]);
    await settle(board, ticker, board.respin([coin(B)]));
    expect(BeatSymbol.landings).toBe(0);
    expect(BeatSymbol.wins).toEqual([]);
    board.destroy();
    ticker.destroy();
  });

  it('decides per coin when given a function', async () => {
    const { board, ticker } = build((c) => (c.id === 'collector' ? 'win' : 'none'));
    board.enter([coin(A)]);
    await settle(board, ticker, board.respin([coin(B, 'collector'), coin(C)]));
    for (const s of BeatSymbol.pending) s.resolveBeat?.();
    await flush();
    expect(BeatSymbol.wins).toEqual(['collector']);
    expect(BeatSymbol.landings).toBe(0);
    board.destroy();
    ticker.destroy();
  });
});
