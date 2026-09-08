/**
 * The landing-frame signal. `spin:reelLanded` fires only once the stop
 * bounce has settled, a whole `bounceDuration` after the reel is on its
 * result frame; a landing-coupled presentation (an overlay growing over a
 * reel, a symbol takeover) needs the earlier moment. `Reel.notifyLanded()` is
 * where every landing path converges, so it raises `landing`, bridged to the
 * set's `spin:reelLanding`, after its `onReelLanded()` loop - and that loop
 * now tells each symbol which reel and cell it landed in.
 */
import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { ReelLandingContext } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

class ContextSymbol extends HeadlessSymbol {
  contexts: ReelLandingContext[] = [];
  override onReelLanded(ctx?: ReelLandingContext): void {
    if (ctx) this.contexts.push(ctx);
  }
}

/** Reports a landing beat through `trackLanding`, resolved by the test. */
class BeatSymbol extends HeadlessSymbol {
  resolveBeat: (() => void) | null = null;
  override onReelLanded(): void {
    void this.trackLanding(new Promise<void>((resolve) => { this.resolveBeat = resolve; }));
  }
}

function build(SymbolClass: typeof HeadlessSymbol): { reelSet: ReelSet; ticker: FakeTicker } {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(100, 100)
    .symbols((r) => {
      r.register('a', SymbolClass, {});
      r.register('b', SymbolClass, {});
    })
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, ticker };
}

/** Pump frames until `p` settles, counting the frames it took. */
async function pump(ticker: FakeTicker, p: Promise<unknown>, onTick?: (frame: number) => void): Promise<void> {
  let done = false;
  void p.then(() => { done = true; }, () => { done = true; });
  for (let frame = 0; frame < 5000 && !done; frame++) {
    ticker.tick(16);
    onTick?.(frame);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!done) throw new Error('spin never settled');
}

const RESULT = [
  { visible: ['a', 'b', 'a'] },
  { visible: ['b', 'b', 'b'] },
  { visible: ['a', 'a', 'a'] },
];

describe('spin:reelLanding', () => {
  it('fires per reel a bounce before spin:reelLanded on an animated stop', async () => {
    const { reelSet, ticker } = build(HeadlessSymbol);
    let frame = 0;
    const landingAt = new Map<number, number>();
    const landedAt = new Map<number, number>();
    reelSet.events.on('spin:reelLanding', (reel, symbols) => {
      landingAt.set(reel, frame);
      expect(symbols).toEqual(RESULT[reel].visible);
    });
    reelSet.events.on('spin:reelLanded', (reel) => landedAt.set(reel, frame));

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin, (f) => { frame = f; });

    expect([...landingAt.keys()].sort()).toEqual([0, 1, 2]);
    for (const reel of [0, 1, 2]) {
      // NORMAL bounces for 600ms: the landing frame is well before the settle.
      expect(landedAt.get(reel)! - landingAt.get(reel)!).toBeGreaterThanOrEqual(600 / 16 - 2);
    }
    reelSet.destroy();
    ticker.destroy();
  });

  it('fires in the same tick as spin:reelLanded on a slam, which has no bounce', async () => {
    const { reelSet, ticker } = build(HeadlessSymbol);
    const order: string[] = [];
    reelSet.events.on('spin:reelLanding', (reel) => order.push(`landing:${reel}`));
    reelSet.events.on('spin:reelLanded', (reel) => order.push(`landed:${reel}`));

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.slamStop();
    expect(order).toEqual([
      'landing:0', 'landed:0',
      'landing:1', 'landed:1',
      'landing:2', 'landed:2',
    ]);
    await spin;
    reelSet.destroy();
    ticker.destroy();
  });

  it('fires after every visible symbol has had onReelLanded, and mirrors the reel-level `landing`', async () => {
    const { reelSet, ticker } = build(ContextSymbol);
    const reelLevel: number[] = [];
    reelSet.reels.forEach((reel, i) => reel.events.on('landing', () => reelLevel.push(i)));
    reelSet.events.on('spin:reelLanding', (reelIndex) => {
      const reel = reelSet.reels[reelIndex];
      for (let cell = 0; cell < reel.visibleCells; cell++) {
        expect((reel.getSymbolAt(cell) as ContextSymbol).contexts).toHaveLength(1);
      }
    });

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.slamStop();
    await spin;
    expect(reelLevel).toEqual([0, 1, 2]);
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('onReelLanded(ctx)', () => {
  it('tells each symbol its reel, cell, set size and id', async () => {
    const { reelSet, ticker } = build(ContextSymbol);
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.slamStop();
    await spin;

    reelSet.reels.forEach((reel, reelIndex) => {
      for (let cell = 0; cell < 3; cell++) {
        const sym = reel.getSymbolAt(cell) as ContextSymbol;
        expect(sym.contexts).toEqual([
          { reelIndex, reelCount: 3, cell, visibleCells: 3, symbolId: RESULT[reelIndex].visible[cell] },
        ]);
      }
    });
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('ReelSymbol.landing', () => {
  it('exposes the tracked beat until the reel leaves rest, then clears it', async () => {
    const { reelSet, ticker } = build(BeatSymbol);
    const sym = () => reelSet.reels[0].getSymbolAt(1) as BeatSymbol;
    expect(sym().landing).toBeNull();

    const first = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.slamStop();
    await first;

    const landed = sym();
    expect(landed.landing).toBeInstanceOf(Promise);
    landed.resolveBeat!();
    await landed.landing;
    // Resolved but still reported: "already landed" is a state, not an event.
    expect(landed.landing).toBeInstanceOf(Promise);

    const second = reelSet.spin();
    // The reel leaves rest on its first frame of motion, not inside `spin()`.
    for (let i = 0; i < 3; i++) ticker.tick(16);
    expect(landed.landing).toBeNull();
    reelSet.setResult(RESULT);
    reelSet.slamStop();
    await second;
    reelSet.destroy();
    ticker.destroy();
  });

  it('is cleared when the symbol is pooled', () => {
    const sym = new BeatSymbol();
    sym.activate('a');
    sym.onReelLanded();
    expect(sym.landing).toBeInstanceOf(Promise);
    sym.deactivate();
    expect(sym.landing).toBeNull();
    sym.destroy();
  });
});
