import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HorizontalReelBuilder } from '../../src/horizontal/HorizontalReelBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

const IDS = ['s0', 's1', 's2', 's3', 's4', 's5'];

const build = (fn: (b: HorizontalReelBuilder) => HorizontalReelBuilder = (b) => b, ticker = new FakeTicker()) =>
  fn(
    new HorizontalReelBuilder()
      .visibleCount(4)
      .cellSize(72, 72, { gap: 0 })
      .symbols((r) => {
        for (const id of IDS) r.register(id, HeadlessSymbol, {});
      })
      .content(IDS)
      .ticker(ticker as unknown as Ticker),
  ).build();

describe('HorizontalReelBuilder validation', () => {
  it('requires symbols, content and ticker', () => {
    expect(() => new HorizontalReelBuilder().content(IDS).ticker(new FakeTicker() as unknown as Ticker).build()).toThrow(
      /\.symbols/,
    );
    expect(() =>
      new HorizontalReelBuilder().symbols((r) => r.register('s0', HeadlessSymbol, {})).ticker(new FakeTicker() as unknown as Ticker).build(),
    ).toThrow(/\.content/);
    expect(() =>
      new HorizontalReelBuilder().symbols((r) => r.register('s0', HeadlessSymbol, {})).content(['s0']).build(),
    ).toThrow(/\.ticker/);
  });

  it('rejects a visibleCount below 1', () => {
    expect(() => new HorizontalReelBuilder().visibleCount(0)).toThrow(/visibleCount/);
  });

  it('rejects content ids that were never registered', () => {
    expect(() =>
      new HorizontalReelBuilder()
        .symbols((r) => r.register('s0', HeadlessSymbol, {}))
        .content(['s0', 'ghost'])
        .ticker(new FakeTicker() as unknown as Ticker)
        .build(),
    ).toThrow(/ghost/);
  });
});

describe('HorizontalReel layout', () => {
  it('seeds visibleCount + 1 instances and reports window geometry', () => {
    const reel = build();
    expect(reel.visibleCount).toBe(4);
    expect(reel.width).toBe(4 * 72); // gap 0 → 288
    expect(reel.height).toBe(72);
    // 4 visible + 1 off-edge buffer
    expect(reel.container.children.length).toBeGreaterThanOrEqual(4 + 1);
    reel.destroy();
  });

  it('exposes visible symbols left-to-right via symbolAt', () => {
    const reel = build();
    expect(reel.symbolAt(0).symbolId).toBe('s0');
    expect(reel.symbolAt(1).symbolId).toBe('s1');
    expect(reel.symbolAt(3).symbolId).toBe('s3');
    expect(() => reel.symbolAt(4)).toThrow(/outside/);
    reel.destroy();
  });

  it('starts running by default and can be built paused', () => {
    const running = build();
    expect(running.isRunning).toBe(true);
    running.destroy();
    const paused = build((b) => b.autoStart(false));
    expect(paused.isRunning).toBe(false);
    paused.destroy();
  });
});

describe('HorizontalReel scroll mode', () => {
  it('rtl scrolls leftward and wraps a new symbol in from the right', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('rtl').scroll(8), ticker);
    const entered: { id: string; edge: string }[] = [];
    reel.events.on('symbol:entered', (e) => entered.push(e));

    const before = reel.symbolAt(0).view.x;
    ticker.tick(16); // deltaTime 1 -> -8px
    expect(reel.symbolAt(0).view.x).toBeLessThan(before);

    ticker.tickFor(160); // drive well past one span (72px)
    expect(entered.length).toBeGreaterThanOrEqual(1);
    expect(entered[0].edge).toBe('right');
    expect(entered[0].id).toBe('s5'); // feed index 5 → content[5]
    // instance count is stable — symbols recycle, they don't accumulate
    expect(reel.container.children.length).toBeLessThanOrEqual(4 + 2 + 1);
    reel.destroy();
  });

  it('ltr scrolls rightward and wraps a new symbol in from the left', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('ltr').scroll(8), ticker);
    const entered: { id: string; edge: string }[] = [];
    reel.events.on('symbol:entered', (e) => entered.push(e));

    // Track one fixed instance over a few frames that stay short of a wrap.
    const tracked = reel.symbolAt(0);
    const before = tracked.view.x;
    ticker.tickFor(48); // 3 frames × 8px = +24px, well short of the 288px window
    expect(tracked.view.x).toBeGreaterThan(before);
    // then drive far enough to force at least one wrap in from the left
    ticker.tickFor(640);
    expect(entered.length).toBeGreaterThanOrEqual(1);
    expect(entered[0].edge).toBe('left');
    reel.destroy();
  });

  it('does not move while stopped', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.scroll(8).autoStart(false), ticker);
    const x = reel.symbolAt(0).view.x;
    ticker.tickFor(320);
    expect(reel.symbolAt(0).view.x).toBe(x);
    reel.start();
    ticker.tick(16);
    expect(reel.symbolAt(0).view.x).not.toBe(x);
    reel.destroy();
  });
});

describe('HorizontalReel cascade mode', () => {
  it('holds, then steps one cell and emits cascade:step', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('rtl').cascade({ interval: 300, duration: 160 }), ticker);
    const steps: number[] = [];
    reel.events.on('cascade:step', ({ step }) => steps.push(step));

    ticker.tickFor(200); // still inside the hold — no step yet
    expect(steps).toHaveLength(0);

    ticker.tickFor(400); // clears the 300ms hold + 160ms step
    expect(steps).toContain(1);
    reel.destroy();
  });
});

describe('HorizontalReel runtime API', () => {
  it('setContent swaps the feed and rejects bad input', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.direction('rtl').scroll(8), ticker);
    reel.setContent(['s2', 's3']);
    const entered: string[] = [];
    reel.events.on('symbol:entered', (e) => entered.push(e.id));
    ticker.tickFor(320);
    // every newly fed id comes from the new content set
    expect(entered.length).toBeGreaterThan(0);
    for (const id of entered) expect(['s2', 's3']).toContain(id);

    expect(() => reel.setContent([])).toThrow(/at least one/);
    expect(() => reel.setContent(['ghost'])).toThrow(/ghost/);
    reel.destroy();
  });

  it('setDirection flips travel', () => {
    const reel = build();
    expect(reel.direction).toBe('rtl');
    reel.setDirection('ltr');
    expect(reel.direction).toBe('ltr');
    reel.destroy();
  });

  it('is destroyable once and drops its ticker subscription', () => {
    const ticker = new FakeTicker();
    const reel = build((b) => b.scroll(8), ticker);
    expect(ticker.listenerCount).toBe(1);
    expect(reel.isDestroyed).toBe(false);
    reel.destroy();
    expect(reel.isDestroyed).toBe(true);
    expect(ticker.listenerCount).toBe(0);
    expect(() => reel.destroy()).not.toThrow();
  });
});
