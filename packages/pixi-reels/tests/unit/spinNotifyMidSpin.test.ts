import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
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
}

function build(ticker: FakeTicker) {
  return new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(100, 100)
    .ticker(ticker as unknown as Ticker)
    .symbols((r) => {
      r.register('a', TrackingSymbol, {});
      r.register('b', TrackingSymbol, {});
    })
    .build();
}

const events = (sym: unknown) => (sym as TrackingSymbol).events;

describe('mid-spin symbol notifications (Reel level)', () => {
  it('notifySpinStart / notifySpinEnd reach buffer cells, not just visible ones', () => {
    const ticker = new FakeTicker();
    const reelSet = build(ticker);
    const reel = reelSet.reels[0];

    reel.notifySpinStart();
    for (const sym of reel.symbols) expect(events(sym)).toContain('start');

    reel.notifySpinEnd();
    for (const sym of reel.symbols) expect(events(sym)).toContain('end');

    reelSet.destroy();
    ticker.destroy();
  });

  it('symbols installed while the reel is moving receive onReelSpinStart(true)', () => {
    const ticker = new FakeTicker();
    const reelSet = build(ticker);
    const reel = reelSet.reels[0];

    reel.notifySpinStart();
    reel.speed = 50;
    // Two seconds of frames - plenty of wraps, so the pool recycles
    // symbols through _replaceSymbol while the spin flag is armed.
    for (let i = 0; i < 120; i++) reel.update(16);
    reel.speed = 0;

    // Every symbol now on the strip either survived from spin start
    // ('start') or was installed mid-spin and must know it ('start:mid').
    let sawMidSpinJoin = false;
    for (const sym of reel.symbols) {
      const e = events(sym);
      expect(e.some((x) => x === 'start' || x === 'start:mid')).toBe(true);
      if (e.includes('start:mid')) sawMidSpinJoin = true;
    }
    expect(sawMidSpinJoin).toBe(true);

    // Disarm: notifySpinEnd reaches everyone, and later installs are quiet.
    reel.notifySpinEnd();
    for (const sym of reel.symbols) expect(events(sym)).toContain('end');

    reelSet.destroy();
    ticker.destroy();
  });

  it('does not fire spin notifications on idle symbol swaps', () => {
    const ticker = new FakeTicker();
    const reelSet = build(ticker);

    reelSet.setSymbolAt(0, 1, 'b');
    const swapped = reelSet.reels[0].symbols[reelSet.reels[0].bufferStart + 1];
    expect(events(swapped)).toEqual([]);

    reelSet.destroy();
    ticker.destroy();
  });

  it('slam-stopped spins still notify spin start before spin end (skip path)', async () => {
    const ticker = new FakeTicker();
    const reelSet = build(ticker);

    const promise = reelSet.spin();
    reelSet.setResult([
      { visible: ['a', 'b', 'a'] },
      { visible: ['b', 'a', 'b'] },
      { visible: ['a', 'b', 'a'] },
    ]);
    reelSet.slamStop();
    await promise;

    for (const reel of reelSet.reels) {
      const visible = reel.symbols.slice(reel.bufferStart, reel.bufferStart + reel.visibleCells);
      for (const sym of visible) {
        const e = events(sym);
        const lastEnd = e.lastIndexOf('end');
        const firstStart = e.findIndex((x) => x === 'start' || x === 'start:mid');
        expect(lastEnd).toBeGreaterThan(-1);
        expect(firstStart).toBeGreaterThan(-1);
        expect(firstStart).toBeLessThan(lastEnd);
      }
    }

    reelSet.destroy();
    ticker.destroy();
  });
});
