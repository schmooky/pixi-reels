import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

class CountingSymbol extends HeadlessSymbol {
  public spinEndCount = 0;
  public landedCount = 0;
  override onReelSpinEnd(): void {
    this.spinEndCount++;
  }
  override onReelLanded(): void {
    this.landedCount++;
  }
}

describe('SpinController.skip — symbol lifecycle hooks', () => {
  it('fires onReelSpinEnd and onReelLanded once per visible-row symbol on slam-stop', async () => {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .visibleSymbols(3)
      .symbolSize(100, 100)
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => {
        r.register('a', CountingSymbol, {});
        r.register('b', CountingSymbol, {});
      })
      .build();

    const promise = reelSet.spin();
    reelSet.setResult([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'a', 'a'],
    ]);
    reelSet.slamStop();
    await promise;

    for (const reel of reelSet.reels) {
      const visible = reel.symbols.slice(reel.bufferAbove, reel.bufferAbove + reel.visibleRows);
      for (const sym of visible) {
        expect(sym).toBeInstanceOf(CountingSymbol);
        expect((sym as CountingSymbol).spinEndCount).toBe(1);
        expect((sym as CountingSymbol).landedCount).toBe(1);
      }
    }

    reelSet.destroy();
    ticker.destroy();
  });
});
