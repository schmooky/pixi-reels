import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HorizontalReelBuilder } from '../../src/horizontal/HorizontalReelBuilder.ts';
import { FakeTicker } from '../../src/testing/FakeTicker.ts';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.ts';

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

/** Drive a full spin(): start, land on `result`, return the resolved SpinResult. */
const spinTo = async (reel: ReturnType<typeof build>, ticker: FakeTicker, result: string[]) => {
  const p = reel.spin();
  ticker.tickFor(200); // free spin a bit
  reel.setResult([{ visible: result }]); // one ColumnTarget — this reel
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

  it('defaults initialFrame to the first registered ids', () => {
    const reel = build();
    expect(reel.symbolAt(0).symbolId).toBe('A');
    expect(reel.symbolAt(3).symbolId).toBe('J');
    reel.destroy();
  });

  it('validates an explicit initialFrame (one ColumnTarget, right length, real ids)', () => {
    expect(() => build((b) => b.initialFrame([{ visible: ['A', 'K'] }]))).toThrow(/exactly 4/);
    expect(() => build((b) => b.initialFrame([{ visible: ['A', 'K', 'Q', 'ghost'] }]))).toThrow(/ghost/);
    expect(() => build((b) => b.initialFrame([{ visible: IDS.slice(0, 4) }, { visible: IDS.slice(0, 4) }]))).toThrow(
      /exactly one ColumnTarget/,
    );
  });
});

describe('HorizontalReel spin/setResult (ReelSet-style API)', () => {
  it('lands on exactly the setResult symbols (rtl)', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('rtl'), ticker);
    const target = ['Q', 'A', 'J', 'K'];
    const result = await spinTo(reel, ticker, target);
    // SpinResult is a one-column grid, same shape as ReelSet's.
    expect(result.symbols).toEqual([target]);
    expect(result.wasSkipped).toBe(false);
    expect(typeof result.duration).toBe('number');
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
    expect(result.symbols).toEqual([target]);
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(target);
    reel.destroy();
  });

  it('emits spin:start then spin:complete with the result', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    const events: string[] = [];
    let landed: string[][] | null = null;
    reel.events.on('spin:start', () => events.push('start'));
    reel.events.on('spin:complete', (r) => { events.push('complete'); landed = r.symbols; });
    await spinTo(reel, ticker, ['A', 'A', 'K', 'Q']);
    expect(events).toEqual(['start', 'complete']);
    expect(landed).toEqual([['A', 'A', 'K', 'Q']]);
    reel.destroy();
  });

  it('reports isSpinning across the lifecycle', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    expect(reel.isSpinning).toBe(false);
    reel.spin();
    expect(reel.isSpinning).toBe(true);
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    expect(reel.isSpinning).toBe(true);
    ticker.tickFor(4000);
    expect(reel.isSpinning).toBe(false);
    reel.destroy();
  });

  it('skipSpin slams straight to the result and flags wasSkipped', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b, ticker);
    const p = reel.spin();
    ticker.tickFor(100);
    reel.setResult([{ visible: ['K', 'Q', 'J', '10'] }]);
    reel.skipSpin(); // no more ticks
    const result = await p;
    expect(result.symbols).toEqual([['K', 'Q', 'J', '10']]);
    expect(result.wasSkipped).toBe(true);
    reel.destroy();
  });
});

describe('HorizontalReel cascade (real tumble: remove, collapse, refill)', () => {
  const landIdle = (b?: (b: HorizontalReelBuilder) => HorizontalReelBuilder) => {
    const ticker = new FakeTicker();
    const reel = build(b, ticker);
    // give it a known window
    reel.spin();
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    return { reel, ticker };
  };

  it('removes winners, collapses survivors to the settle side, refills from the feed side (rtl)', async () => {
    const { reel, ticker } = landIdle();
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(['A', 'K', 'Q', 'J']);
    // cells 0 (A) and 2 (Q) win → removed. Survivors K,J collapse LEFT (rtl
    // settle side); new 9,10 refill the RIGHT (feed side), in order.
    const p = reel.cascade([0, 2], ['9', '10']);
    ticker.tickFor(2000);
    await p;
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(['K', 'J', '9', '10']);
    reel.destroy();
  });

  it('mirrors for ltr — survivors collapse right, new symbols refill from the left', async () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('ltr'), ticker);
    reel.spin();
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    // cells 0 (A) and 2 (Q) win → new 9,10 fill the LEFT (feed side), survivors
    // K,J collapse RIGHT (settle side).
    const p = reel.cascade([0, 2], ['9', '10']);
    ticker.tickFor(2000);
    await p;
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(['9', '10', 'K', 'J']);
    reel.destroy();
  });

  it('"they all drop" — every cell removed and refilled', async () => {
    const { reel, ticker } = landIdle();
    const p = reel.cascade([0, 1, 2, 3], ['9', '9', '10', 'A']);
    ticker.tickFor(2000);
    await p;
    expect([0, 1, 2, 3].map((i) => reel.symbolAt(i).symbolId)).toEqual(['9', '9', '10', 'A']);
    reel.destroy();
  });

  it('emits cascade:complete with the winners and the collapsed+refilled window', async () => {
    const { reel, ticker } = landIdle();
    let payload: { winners: number[]; symbols: string[] } | null = null;
    reel.events.on('cascade:complete', (e) => { payload = e; });
    // remove K(1), J(3); survivors A,Q collapse left; new A,A refill right.
    const p = reel.cascade([1, 3], ['A', 'A']);
    ticker.tickFor(2000);
    await p;
    expect(payload?.winners).toEqual([1, 3]);
    expect(payload?.symbols).toEqual(['A', 'Q', 'A', 'A']);
    reel.destroy();
  });

  it('validates winners range, uniqueness, id registration, and idle state', () => {
    const { reel, ticker } = landIdle();
    expect(() => reel.cascade([4], ['A'])).toThrow(/outside/);
    expect(() => reel.cascade([1, 1], ['A', 'K'])).toThrow(/unique/);
    expect(() => reel.cascade([0], ['ghost'])).toThrow(/ghost/);
    expect(() => reel.cascade([0], ['A', 'K'])).toThrow(/match winners length/);
    reel.spin();
    expect(() => reel.cascade([0], ['A'])).toThrow(/needs the reel idle/);
    ticker.tickFor(1); // let a frame pass
    reel.destroy();
  });

  it('an empty cascade is a no-op that resolves', async () => {
    const { reel } = landIdle();
    await expect(reel.cascade([])).resolves.toBeUndefined();
    reel.destroy();
  });
});

describe('HorizontalReel API guards', () => {
  it('setResult mirrors the ColumnTarget[] contract (length 1, right visible, no buffers)', () => {
    const reel = build();
    expect(() => reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }])).toThrow(/spin\(\) before/);
    reel.spin();
    expect(() => reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }, { visible: ['A', 'K', 'Q', 'J'] }])).toThrow(
      /exactly one ColumnTarget/,
    );
    expect(() => reel.setResult([{ visible: ['A', 'K'] }])).toThrow(/exactly 4/);
    expect(() => reel.setResult([{ visible: ['A', 'K', 'Q', 'ghost'] }])).toThrow(/ghost/);
    expect(() => reel.setResult([{ visible: ['A', 'K', 'Q', 'J'], bufferAbove: ['A'] }])).toThrow(
      /bufferAbove|bufferBelow/,
    );
    reel.destroy();
  });

  it('throws on double spin and on skipSpin without a result', () => {
    const reel = build();
    reel.spin();
    expect(() => reel.spin()).toThrow(/not idle/);
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
