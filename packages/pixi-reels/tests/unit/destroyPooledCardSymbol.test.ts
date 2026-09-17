/**
 * `ReelSet.destroy()` with a pooled `CardSymbol`.
 *
 * A released symbol's view stays a child of its reel container, so
 * `Reel.destroy()` destroys it (children included) before the symbol pool
 * disposes the symbol itself. `CardSymbol.stopAnimation()` then reset the
 * scale of a label that no longer had one, and the whole teardown threw.
 * Any symbol whose `stopAnimation()` reaches into a child was exposed the
 * same way; `HeadlessSymbol` never was, which is why no test caught it.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { CardSymbol } from '../../src/symbols/CardSymbol.js';
import type { SpeedProfile } from '../../src/config/types.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

describe('ReelSet.destroy() with pooled CardSymbols', () => {
  it('does not throw once a spin has released cards to the pool', async () => {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(2)
      .visibleCells(3)
      .symbolSize(80, 80)
      .symbols((r) => {
        r.register('a', CardSymbol, { color: 0xff0000, label: 'a' });
        r.register('b', CardSymbol, { color: 0x00ff00, label: 'b' });
      })
      .speed(FAST.name, FAST)
      .initialSpeed(FAST.name)
      .ticker(ticker as unknown as Ticker)
      .build();

    const spin = reelSet.spin();
    reelSet.setResult([{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'a', 'b'] }]);
    let done = false;
    void spin.then(() => { done = true; });
    for (let frame = 0; frame < 5000 && !done; frame++) {
      ticker.tick(16);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(done).toBe(true);

    expect(() => reelSet.destroy()).not.toThrow();
    ticker.destroy();
  });
});
