/**
 * `HoldAndWinBoard.skip({ mode: 'quicken' })`: the board's quicken.
 *
 * Every cell is its own 1x1 reel set and the board folds its stagger into
 * each cell's spin floor, so a quickened cell drops the floor and the whole
 * wave lands together - through each cell's stop, with its bounce, rather
 * than placed the way a slam lands it.
 *
 * GSAP runs on the real clock in node, so bounds are generous.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HoldAndWinBuilder } from '../../src/board/HoldAndWinBuilder.js';
import type { HoldAndWinBoard } from '../../src/board/HoldAndWinBoard.js';
import type { HwCell } from '../../src/board/HwTypes.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { SkipMode, SpeedProfile } from '../../src/config/types.js';

const STAGGER_MS = 300;
const BOUNCE_MS = 200;

const NORMAL: SpeedProfile = {
  name: 'normal',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 8,
  bounceDuration: BOUNCE_MS,
  accelerationDuration: 20,
  minimumSpinTime: 100,
};
const TURBO: SpeedProfile = { ...NORMAL, name: 'turbo', spinSpeed: 60, bounceDuration: 60 };

const A: HwCell = { reel: 0, cell: 0 };
const B: HwCell = { reel: 1, cell: 0 };
const C: HwCell = { reel: 0, cell: 1 };
const D: HwCell = { reel: 1, cell: 1 };
const FREE = [B, C, D];
const coin = (cell: HwCell) => ({ cell, id: 'coin', data: { value: 1 } });

function build(skipMode?: SkipMode) {
  const ticker = new FakeTicker();
  const builder = new HoldAndWinBuilder<{ value: number }>()
    .grid(2, 2)
    .cellSize(40)
    .symbols((r) => r.register('coin', HeadlessSymbol, {}))
    .weights({ coin: 1, empty: 1 })
    .speeds({ normal: NORMAL, turbo: TURBO })
    .initialSpeed('normal')
    // A wave that lands one cell every 300 ms when left alone.
    .stagger((reel, cell) => (reel * 2 + cell) * STAGGER_MS)
    .ticker(ticker as unknown as Ticker);
  if (skipMode) builder.skipMode(skipMode);
  const board = builder.build();
  const pump = setInterval(() => ticker.tick(16), 16);
  const landingAt = new Map<string, number>();
  const landedAt = new Map<string, number>();
  const key = (c: HwCell): string => `${c.reel},${c.cell}`;
  for (const cell of [A, B, C, D]) {
    const reel = board.reelAt(cell).reels[0];
    reel.events.on('landing', () => landingAt.set(key(cell), performance.now()));
    reel.events.on('landed', () => landedAt.set(key(cell), performance.now()));
  }
  const skips: Array<{ inFlight: number; mode: SkipMode }> = [];
  board.events.on('feature:skip', (info) => skips.push(info));
  return {
    board,
    ticker,
    landingAt,
    landedAt,
    skips,
    key,
    bounceMs(cell: HwCell): number {
      return landedAt.get(key(cell))! - landingAt.get(key(cell))!;
    },
    destroy() {
      clearInterval(pump);
      board.destroy();
      ticker.destroy();
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Seed one coin and start a wave on the other three cells. */
function startWave(board: HoldAndWinBoard<{ value: number }>) {
  board.enter([coin(A)]);
  return board.respin([coin(B)]);
}

describe("HoldAndWinBoard.skip({ mode: 'quicken' })", () => {
  let h: ReturnType<typeof build> | null = null;
  afterEach(() => {
    h?.destroy();
    h = null;
  });

  it('lands every in-flight cell through its stop, together, and reports the count and mode', async () => {
    h = build();
    const wave = startWave(h.board);
    await sleep(40);
    const pressed = performance.now();
    expect(h.board.skip({ mode: 'quicken' })).toBe(FREE.length);
    expect(h.skips).toEqual([{ inFlight: FREE.length, mode: 'quicken' }]);
    // Nothing placed: the cells are still in flight after the press.
    expect(h.landedAt.size).toBe(0);

    const result = await wave;
    expect(result.hits.map((c) => h!.key(c.cell))).toEqual([h.key(B)]);
    for (const cell of FREE) {
      // Each cell bounced: landing frame and settle a bounce apart.
      expect(h.bounceMs(cell)).toBeGreaterThanOrEqual(BOUNCE_MS * 0.7);
    }
    // The stagger is gone: three cells that would have landed 300 ms apart
    // settle within a fraction of one step of each other, and soon.
    const settled = FREE.map((c) => h!.landedAt.get(h!.key(c))!);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(STAGGER_MS);
    expect(Math.max(...settled) - pressed).toBeLessThan(STAGGER_MS * 3);
  });

  it('slams by default, and quickens by default once the builder says so', async () => {
    h = build();
    const wave = startWave(h.board);
    await sleep(40);
    h.board.skip();
    // A slam lands synchronously.
    expect(h.skips).toEqual([{ inFlight: FREE.length, mode: 'slam' }]);
    expect(h.landedAt.size).toBe(FREE.length);
    await wave;
    h.destroy();

    h = build('quicken');
    const wave2 = startWave(h.board);
    await sleep(40);
    h.board.skip();
    expect(h.skips).toEqual([{ inFlight: FREE.length, mode: 'quicken' }]);
    expect(h.landedAt.size).toBe(0);
    await wave2;
  });

  it('lands the wave on the named profile, and refuses one the board never registered', async () => {
    h = build();
    expect(() => h!.board.skip({ mode: 'quicken', speed: 'nope' })).toThrow(/names no registered profile/);

    const wave = startWave(h.board);
    await sleep(40);
    h.board.skip({ mode: 'quicken', speed: 'turbo' });
    await wave;
    for (const cell of FREE) {
      // Turbo's 60 ms bounce, not normal's 200 ms.
      expect(h.bounceMs(cell)).toBeLessThan(BOUNCE_MS * 0.7);
    }
  });

  it('is a no-op with nothing in flight', () => {
    h = build();
    expect(h.board.skip({ mode: 'quicken' })).toBe(0);
    expect(h.skips).toEqual([{ inFlight: 0, mode: 'quicken' }]);
  });
});

describe('feature:skip carries the press', () => {
  let h: ReturnType<typeof build> | null = null;
  afterEach(() => {
    h?.destroy();
    h = null;
  });

  it('passes speed and payload through as given, and leaves unset keys absent', async () => {
    h = build();
    startWave(h.board);
    await sleep(40);
    const payload = { button: 'skip' };
    h.board.skip({ mode: 'quicken', speed: 'turbo', payload });
    expect(h.skips).toEqual([{ inFlight: FREE.length, mode: 'quicken', speed: 'turbo', payload }]);
    h.destroy();
    h = build('slam');
    startWave(h.board);
    await sleep(40);
    h.board.skip();
    expect(h.skips).toEqual([{ inFlight: FREE.length, mode: 'slam' }]);
    expect('payload' in h.skips[0]!).toBe(false);
  });
});
