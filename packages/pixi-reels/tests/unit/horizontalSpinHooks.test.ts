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
const allSlots = (reel: ReturnType<typeof build>) => {
  // visibleCount window + the two conveyor buffers, via the public window
  // accessor where possible; buffers are asserted through the window after
  // shifts, so the tests stay on public API.
  const out: TrackingSymbol[] = [];
  for (let i = 0; i < reel.visibleCount; i++) out.push(reel.symbolAt(i) as TrackingSymbol);
  return out;
};

describe('HorizontalReel symbol spin hooks', () => {
  it('fires onReelSpinStart on every window slot when the spin starts', () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    for (const sym of allSlots(reel)) expect(events(sym)).toContain('start');

    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    void p;
    reel.destroy();
    ticker.destroy();
  });

  it('symbols fed in while free-spinning join with onReelSpinStart(true)', () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    void reel.spin();
    ticker.tickFor(600); // conveyor shifts — pool recycles symbols mid-spin

    const sawMidSpinJoin = allSlots(reel).some((s) => events(s).includes('start:mid'));
    expect(sawMidSpinJoin).toBe(true);

    reel.destroy();
    ticker.destroy();
  });

  it('un-blurs at setResult: spin-end fires when the deceleration starts, and the result window feeds in live', async () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    ticker.tickFor(400);

    // Everything on the strip at the moment the stop is triggered gets
    // spin-end — the visible slow-down happens crisp.
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    for (const sym of allSlots(reel)) expect(events(sym)).toContain('end');

    ticker.tickFor(4000);
    const result = await p;
    expect(result.symbols[0]).toEqual(['A', 'K', 'Q', 'J']);

    for (const sym of allSlots(reel)) {
      const e = events(sym);
      // Landed cells were fed during 'stopping', so they carry no spin
      // notifications at all (they entered live) — but every one of them
      // got the landing hook, and none was told to blur after the stop.
      expect(e.lastIndexOf('landed')).toBeGreaterThan(-1);
      const lastStart = e.lastIndexOf('start:mid');
      if (lastStart !== -1) expect(e.lastIndexOf('end')).toBeGreaterThan(lastStart);
    }

    reel.destroy();
    ticker.destroy();
  });

  it('slam (skipSpin) lands live symbols with the landing hook fired', async () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    ticker.tickFor(100);
    reel.setResult([{ visible: ['J', 'Q', 'K', 'A'] }]);
    reel.skipSpin();
    const result = await p;
    expect(result.wasSkipped).toBe(true);

    for (const sym of allSlots(reel)) {
      const e = events(sym);
      expect(e).toContain('landed');
      // Slam feeds happen in 'stopping' — no blur-join after the result is set.
      const lastEnd = e.lastIndexOf('end');
      const lastStart = e.lastIndexOf('start:mid');
      expect(lastStart).toBeLessThan(lastEnd === -1 ? 0 : lastEnd + 1);
    }

    reel.destroy();
    ticker.destroy();
  });

  it('does not fire spin hooks during a cascade (cascading symbols stay live)', async () => {
    const ticker = new FakeTicker();
    const reel = build(ticker);

    const p = reel.spin();
    ticker.tickFor(100);
    reel.setResult([{ visible: ['A', 'K', 'Q', 'J'] }]);
    ticker.tickFor(4000);
    await p;

    for (const sym of allSlots(reel)) events(sym).length = 0;

    const c = reel.cascade([1, 2]);
    ticker.tickFor(6000);
    await c;

    for (const sym of allSlots(reel)) {
      const e = events(sym);
      expect(e.filter((x) => x.startsWith('start') || x === 'end')).toEqual([]);
    }

    reel.destroy();
    ticker.destroy();
  });
});
