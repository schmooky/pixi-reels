import { beforeEach, describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HoldAndWinBuilder } from '../../src/board/HoldAndWinBuilder.js';
import type { HoldAndWinBoard } from '../../src/board/HoldAndWinBoard.js';
import type { HwCell, HwLockAnimation } from '../../src/board/HwTypes.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

/** Counts the one-shots the board fires on it. */
class TrackedSymbol extends HeadlessSymbol {
  static wins = 0;
  static landings = 0;
  override async playWin(): Promise<void> {
    TrackedSymbol.wins += 1;
  }
  override async playLanding(): Promise<void> {
    TrackedSymbol.landings += 1;
  }
}

const A: HwCell = { reel: 0, cell: 0 };
const B: HwCell = { reel: 1, cell: 0 };
const C: HwCell = { reel: 0, cell: 1 };
const D: HwCell = { reel: 1, cell: 1 };
const coin = (cell: HwCell) => ({ cell, id: 'coin', data: { value: 1 } });

function build(opts: { lock?: HwLockAnimation; inactive?: HwCell[]; inactiveId?: string } = {}) {
  const ticker = new FakeTicker();
  const builder = new HoldAndWinBuilder<{ value: number }>()
    .grid(2, 2)
    .cellSize({ width: 40, height: 30 }, { columnGap: 2, rowGap: 0 })
    .symbols((r) => {
      r.register('coin', TrackedSymbol, {});
      r.register('sealed', TrackedSymbol, {});
    })
    .weights({ coin: 1, empty: 1 })
    .stagger(() => 0)
    .ticker(ticker as unknown as Ticker);
  if (opts.lock) builder.lockAnimation(opts.lock);
  if (opts.inactive) builder.inactive(opts.inactive, opts.inactiveId);
  return { board: builder.build(), ticker };
}

/** Slam the wave and pump frames until the awaited respin resolves. */
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

beforeEach(() => {
  TrackedSymbol.wins = 0;
  TrackedSymbol.landings = 0;
});

describe('HoldAndWinBoard rectangular cells', () => {
  it('carries width, height and both gaps into the geometry', () => {
    const { board, ticker } = build();
    expect(board.cellBounds(D)).toEqual({ x: 42, y: 30, width: 40, height: 30 });
    expect(board.cellCenter(A)).toEqual({ x: 20, y: 15 });
    board.destroy();
    ticker.destroy();
  });

  it('hands cellChrome the width and the height', () => {
    const seen: Array<[number, number]> = [];
    const ticker = new FakeTicker();
    const board = new HoldAndWinBuilder()
      .grid(1, 1)
      .cellSize({ width: 50, height: 20 })
      .symbols((r) => r.register('coin', TrackedSymbol, {}))
      .cellChrome((_g, width, height) => { seen.push([width, height]); })
      .ticker(ticker as unknown as Ticker)
      .build();
    expect(seen).toEqual([[50, 20]]);
    board.destroy();
    ticker.destroy();
  });
});

describe('HoldAndWinBoard lock animation', () => {
  it('plays the win on every lock by default', async () => {
    const { board, ticker } = build();
    board.enter([coin(A)]);
    await settle(board, ticker, board.respin([coin(B)]));
    expect(TrackedSymbol.wins).toBe(1);
    expect(TrackedSymbol.landings).toBe(0);
    board.destroy();
    ticker.destroy();
  });

  it("plays only the landing beat with lockAnimation('landing')", async () => {
    const { board, ticker } = build({ lock: 'landing' });
    board.enter([coin(A)]);
    await settle(board, ticker, board.respin([coin(B)]));
    expect(TrackedSymbol.landings).toBe(1);
    expect(TrackedSymbol.wins).toBe(0);
    board.destroy();
    ticker.destroy();
  });

  it("plays nothing with lockAnimation('none')", async () => {
    const { board, ticker } = build({ lock: 'none' });
    board.enter([coin(A)]);
    await settle(board, ticker, board.respin([coin(B), coin(C)]));
    expect(TrackedSymbol.landings).toBe(0);
    expect(TrackedSymbol.wins).toBe(0);
    board.destroy();
    ticker.destroy();
  });

  it('playWin() celebrates every locked coin, or just the cells given', async () => {
    const { board, ticker } = build({ lock: 'none' });
    board.enter([coin(A), coin(B)]);
    await board.playWin();
    expect(TrackedSymbol.wins).toBe(2);
    await board.playWin([A]);
    expect(TrackedSymbol.wins).toBe(3);
    board.destroy();
    ticker.destroy();
  });
});

describe('HoldAndWinBoard inactive cells', () => {
  it('dresses dormant cells with the inactive id and keeps them out of the feature', async () => {
    const { board, ticker } = build({ inactive: [C, D], inactiveId: 'sealed' });
    expect(board.symbolAt(C).symbolId).toBe('sealed');
    expect(board.symbolAt(A).symbolId).toBe('empty');
    expect(board.capacity).toBe(2);
    expect(board.inactiveCells).toEqual([C, D]);
    expect(board.freeCells).toEqual([A, B]);

    board.enter([coin(A)]);
    const spinning: HwCell[][] = [];
    board.events.on('respin:start', (e) => spinning.push(e.spinning));
    await expect(board.respin([coin(C)])).rejects.toThrow(/inactive cell 0,1/);
    const result = await settle(board, ticker, board.respin([coin(B)]));
    expect(spinning[0]).toEqual([B]);
    expect(result.full).toBe(true);
    expect(board.symbolAt(C).symbolId).toBe('sealed');
    board.destroy();
    ticker.destroy();
  });

  it('activate() wakes cells, shows the empty symbol and grows capacity', async () => {
    const { board, ticker } = build({ inactive: [C, D], inactiveId: 'sealed' });
    const woken: unknown[] = [];
    board.events.on('cells:activated', (e) => woken.push(e));
    board.enter([coin(A)]);
    board.activate([C, D]);
    expect(woken).toEqual([{ cells: [C, D], capacity: 4 }]);
    expect(board.capacity).toBe(4);
    expect(board.symbolAt(C).symbolId).toBe('empty');
    expect(board.freeCells).toEqual([C, B, D]);

    const spinning: HwCell[][] = [];
    board.events.on('respin:start', (e) => spinning.push(e.spinning));
    await settle(board, ticker, board.respin([coin(D)]));
    expect(spinning[0]).toEqual([C, B, D]);
    expect(board.isFull).toBe(false);

    board.reset();
    expect(board.capacity).toBe(2);
    expect(board.symbolAt(C).symbolId).toBe('sealed');
    board.destroy();
    ticker.destroy();
  });

  it('fails at build when the inactive id was never registered', () => {
    const ticker = new FakeTicker();
    expect(() =>
      new HoldAndWinBuilder()
        .grid(1, 2)
        .symbols((r) => r.register('coin', TrackedSymbol, {}))
        .inactive([{ reel: 0, cell: 1 }], 'nope')
        .ticker(ticker as unknown as Ticker)
        .build(),
    ).toThrow(/'nope'/);
    ticker.destroy();
  });
});

describe('HoldAndWinBoard named speeds', () => {
  const FAST = { ...SpeedPresets.TURBO, minimumSpinTime: 100 };
  function buildSpeeds() {
    const ticker = new FakeTicker();
    const seen: string[] = [];
    const board = new HoldAndWinBuilder<{ value: number }>()
      .grid(2, 2)
      .cellSize(40)
      .symbols((r) => r.register('coin', TrackedSymbol, {}))
      .weights({ coin: 1, empty: 1 })
      .speeds({ turbo: FAST })
      .stagger((_reel, _cell, speed) => { seen.push(speed); return 0; })
      .anticipateWhen(({ locked }) => locked >= 1)
      .ticker(ticker as unknown as Ticker)
      .build();
    return { board, ticker, seen };
  }

  it('registers every named profile into every cell and starts on the initial one', () => {
    const { board, ticker } = buildSpeeds();
    expect(board.speed).toBe('normal');
    expect(board.speedNames).toEqual(['normal', 'turbo']);
    for (const cell of board.freeCells) {
      const names = board.reelAt(cell).speed.profileNames;
      expect(names).toEqual(expect.arrayContaining(['normal', 'normal:tension', 'turbo', 'turbo:tension']));
      expect(board.reelAt(cell).speed.activeName).toBe('normal');
    }
    board.destroy();
    ticker.destroy();
  });

  it('setSpeed switches every cell at once and reports it', () => {
    const { board, ticker } = buildSpeeds();
    const changes: unknown[] = [];
    board.events.on('speed:changed', (e) => changes.push(e));
    board.setSpeed('turbo');
    expect(board.speed).toBe('turbo');
    for (const cell of board.freeCells) expect(board.reelAt(cell).speed.activeName).toBe('turbo');
    expect(changes).toEqual([{ name: 'turbo', previous: 'normal' }]);
    expect(() => board.setSpeed('warp')).toThrow(/no registered profile/);
    board.destroy();
    ticker.destroy();
  });

  it('runs an anticipating wave on the active speed tension variant and hands the stagger the speed name', async () => {
    const { board, ticker, seen } = buildSpeeds();
    board.setSpeed('turbo');
    board.enter([coin(A)]);
    const p = board.respin([coin(B)]);
    for (const cell of [B, C, D]) expect(board.reelAt(cell).speed.activeName).toBe('turbo:tension');
    await settle(board, ticker, p);
    expect(seen).toContain('turbo');
    board.destroy();
    ticker.destroy();
  });

  it('addSpeed registers a profile into every cell after build', () => {
    const { board, ticker } = buildSpeeds();
    board.addSpeed('cinematic', { ...SpeedPresets.NORMAL, minimumSpinTime: 900 });
    expect(board.speedNames).toContain('cinematic');
    board.setSpeed('cinematic');
    for (const cell of board.freeCells) {
      expect(board.reelAt(cell).speed.activeName).toBe('cinematic');
      expect(board.reelAt(cell).speed.active.minimumSpinTime).toBe(900);
    }
    board.destroy();
    ticker.destroy();
  });

  it('refuses an initial speed that was never registered', () => {
    const ticker = new FakeTicker();
    expect(() =>
      new HoldAndWinBuilder()
        .grid(1, 1)
        .symbols((r) => r.register('coin', TrackedSymbol, {}))
        .initialSpeed('turbo')
        .ticker(ticker as unknown as Ticker)
        .build(),
    ).toThrow(/initialSpeed\('turbo'\)/);
    ticker.destroy();
  });
});
