import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { HorizontalReelBuilder } from '../../src/horizontal/HorizontalReelBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

class TrackingSymbol extends HeadlessSymbol {
  public events: string[] = [];

  override onReelSpinStart(joinedMidSpin?: boolean): void {
    this.events.push(joinedMidSpin ? 'start:mid' : 'start');
  }

  override onReelSpinEnd(): void {
    this.events.push('end');
  }

  override onReelLanded(): void {
    this.events.push('landed');
  }
}

const IDS = ['A', 'K', 'Q', 'J'];

const build = (ticker: FakeTicker) =>
  new HorizontalReelBuilder()
    .visibleCount(4)
    .cellSize(72, 72, { gap: 0 })
    .symbols((r) => {
      for (const id of IDS) r.register(id, TrackingSymbol, {});
    })
    .rng(() => 0)
    .ticker(ticker as unknown as Ticker)
    .build();

const events = (sym: unknown) => (sym as TrackingSymbol).events;

describe('HorizontalReel symbol spin hooks', () => {
  it('fires onReelSpinStart on every conveyor slot when the spin starts', () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    for (let i = 0; i < reel.visibleCount; i++) {
      expect(events(reel.symbolAt(i))).toContain('start');
    }

    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    void p;
    reel.destroy();
    ticker.destroy();
  });

  it('symbols fed in mid-spin get onReelSpinStart(true); landing fires end then landed', async () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    ticker.tickFor(400); // free spin — conveyor shifts recycle symbols
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    const result = await p;
    expect(result.symbols[0]).toEqual(['A', 'K', 'Q', 'J']);

    let sawMidSpinJoin = false;
    for (let i = 0; i < reel.visibleCount; i++) {
      const e = events(reel.symbolAt(i));
      const start = e.findIndex((x) => x === 'start' || x === 'start:mid');
      const end = e.lastIndexOf('end');
      const landed = e.lastIndexOf('landed');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      expect(landed).toBeGreaterThan(end);
      if (e.includes('start:mid')) sawMidSpinJoin = true;
    }
    // The landed window was fed in while the strip was moving, so at
    // least one of its symbols joined mid-spin.
    expect(sawMidSpinJoin).toBe(true);

    reel.destroy();
    ticker.destroy();
  });

  it('slam (skipSpin) still walks symbols through start → end → landed', async () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    ticker.tickFor(100);
    reel.setResult([{ visible: ['J', 'Q', 'K', 'A'] }]);
    reel.skipSpin();
    const result = await p;
    expect(result.wasSkipped).toBe(true);

    for (let i = 0; i < reel.visibleCount; i++) {
      const e = events(reel.symbolAt(i));
      expect(e.findIndex((x) => x === 'start' || x === 'start:mid')).toBeGreaterThan(-1);
      expect(e.lastIndexOf('landed')).toBeGreaterThan(e.lastIndexOf('end') - 1);
      expect(e).toContain('end');
    }

    reel.destroy();
    ticker.destroy();
  });

  it('does not fire spin hooks during a cascade (cascading symbols stay live)', async () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    // Land a known window first.
    const p = reel.spin();
    ticker.tickFor(100);
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    await p;

    for (let i = 0; i < reel.visibleCount; i++) events(reel.symbolAt(i)).length = 0;

    const c = reel.cascade([1, 2]);
    ticker.tickFor(6000);
    await c;

    for (let i = 0; i < reel.visibleCount; i++) {
      const e = events(reel.symbolAt(i));
      expect(e.filter((x) => x.startsWith('start') || x === 'end')).toEqual([]);
    }

    reel.destroy();
    ticker.destroy();
  });
});
