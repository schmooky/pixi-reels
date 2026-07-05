import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HorizontalReelBuilder } from '../../src/horizontal/HorizontalReelBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

const IDS = ['A', 'K', 'Q', 'J', '10', '9'];

const build = (
  fn: (b: HorizontalReelBuilder) => HorizontalReelBuilder = (b) => b,
  ticker = new FakeTicker(),
) =>
  fn(
    new HorizontalReelBuilder()
      .visibleCount(4)
      .cellSize(72, 72, { gap: 0 })
      .symbols((r) => {
        for (const id of IDS) r.register(id, HeadlessSymbol, {});
      })
      .rng(() => 0) // deterministic spin blur (always IDS[0])
      .ticker(ticker as unknown as Ticker),
  ).build();

/** Drive a full spin(): start, land on `result`, return the resolved symbols. */
const spinTo = async (reel: ReturnType<typeof build>, ticker: FakeTicker, result: string[]) => {
  const p = reel.spin();
  ticker.tickFor(200); // free spin a bit
  reel.setResult(result);
  ticker.tickFor(4000); // plenty of time to drain the queue + land
  return p;
};

describe('HorizontalReelBuilder validation', () => {
  it('requires symbols and ticker', () => {
    expect(() => new HorizontalReelBuilder().ticker(new FakeTicker() as unknown as Ticker).build()).toThrow(
      /\.symbols/,
    );
    expect(() =>
      new HorizontalReelBuilder().symbols((r) => r.register('A', HeadlessSymbol, {})).build(),
    ).toThrow(/\.ticker/);
  });

  it('rejects a visibleCount below 1', () => {
    expect(() => new HorizontalReelBuilder().visibleCount(0)).toThrow(/visibleCount/);
  });

  it('defaults initialResult to the first registered ids', () => {
    const reel = build();
    expect(reel.symbolAt(0).symbolId).toBe('A');
    expect(reel.symbolAt(3).symbolId).toBe('J');
    reel.destroy();
  });

  it('validates an explicit initialResult length + ids', () => {
    expect(() => build((b) => b.initialResult(['A', 'K']))).toThrow(/exactly 4/);
    expect(() => build((b) => b.initialResult(['A', 'K', 'Q', 'ghost']))).toThrow(/ghost/);
  });
});

describe('HorizontalReel spin/setResult (ReelSet-style API)', () => {
  it('lands on exactly the setResult symbols (rtl)', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('rtl'), ticker);
    const target = ['Q', 'A', 'J', 'K'];
    const result = await spinTo(reel, ticker, target);
    expect(result.symbols).toEqual(target);
    // and the live window matches
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(target);
    expect(reel.isSpinning).toBe(false);
    reel.destroy();
  });

  it('lands on exactly the setResult symbols (ltr)', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('ltr'), ticker);
    const target = ['9', 'K', 'A', 'Q'];
    const result = await spinTo(reel, ticker, target);
    expect(result.symbols).toEqual(target);
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(target);
    reel.destroy();
  });

  it('lands correctly in cascade mode', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.cascade({ interval: 20, duration: 40 }), ticker);
    const target = ['J', 'J', 'A', '10'];
    const result = await spinTo(reel, ticker, target);
    expect(result.symbols).toEqual(target);
    reel.destroy();
  });

  it('emits spin:start then spin:complete with the result', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    const events: string[] = [];
    let landed: string[] | null = null;
    reel.events.on('spin:start', () => events.push('start'));
    reel.events.on('spin:complete', (r) => { events.push('complete'); landed = r.symbols; });
    await spinTo(reel, ticker, ['A', 'A', 'K', 'Q']);
    expect(events).toEqual(['start', 'complete']);
    expect(landed).toEqual(['A', 'A', 'K', 'Q']);
    reel.destroy();
  });

  it('reports isSpinning across the lifecycle', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    expect(reel.isSpinning).toBe(false);
    reel.spin();
    expect(reel.isSpinning).toBe(true);
    reel.setResult(['A', 'K', 'Q', 'J']);
    expect(reel.isSpinning).toBe(true);
    ticker.tickFor(4000);
    expect(reel.isSpinning).toBe(false);
    reel.destroy();
  });

  it('skipSpin slams straight to the result', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    const p = reel.spin();
    ticker.tickFor(100);
    reel.setResult(['K', 'Q', 'J', '10']);
    reel.skipSpin(); // no more ticks
    const result = await p;
    expect(result.symbols).toEqual(['K', 'Q', 'J', '10']);
    reel.destroy();
  });
});

describe('HorizontalReel API guards', () => {
  it('throws on setResult before spin, wrong length, and unknown id', () => {
    const reel = build();
    expect(() => reel.setResult(['A', 'K', 'Q', 'J'])).toThrow(/spin\(\) before/);
    reel.spin();
    expect(() => reel.setResult(['A', 'K'])).toThrow(/exactly 4/);
    expect(() => reel.setResult(['A', 'K', 'Q', 'ghost'])).toThrow(/ghost/);
    reel.destroy();
  });

  it('throws on double spin and on skipSpin without a result', () => {
    const reel = build();
    reel.spin();
    expect(() => reel.spin()).toThrow(/already spinning/);
    expect(() => reel.skipSpin()).toThrow(/pending result/);
    reel.destroy();
  });

  it('is destroyable once and drops its ticker subscription', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    expect(ticker.listenerCount).toBe(1);
    reel.destroy();
    expect(reel.isDestroyed).toBe(true);
    expect(ticker.listenerCount).toBe(0);
    expect(() => reel.destroy()).not.toThrow();
  });
});
