/**
 * `ReelSetBuilder.symbolZIndex(resolver)`: the engine asks the consumer for
 * a symbol's z-index instead of computing `symbolData.zIndex * 100 +
 * cellStackingIndex`. A game that grades symbols by row and reel at rest
 * otherwise has to rewrite `view.zIndex` after every landing and swap, and
 * the engine's own refresh keeps overwriting it.
 */
import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { Z_INDEX_BUDGET } from '../../src/config/types.js';
import type { SymbolZIndexContext, SymbolZIndexResolver } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

function build(resolver?: SymbolZIndexResolver, unmask = false): { reelSet: ReelSet; ticker: FakeTicker } {
  const ticker = new FakeTicker();
  const builder = new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(100, 100)
    .symbols((r) => {
      r.register('a', HeadlessSymbol, {});
      r.register('w', HeadlessSymbol, {});
    })
    // `w` only where the frames put it: a random buffer fill of `w` would
    // make "the wild's context" ambiguous.
    .weights({ a: 1, w: 0 })
    .symbolData({ w: { zIndex: 5, unmask } })
    .initialFrame([
      { visible: ['a', 'w', 'a'] },
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
    ])
    .ticker(ticker as unknown as Ticker);
  if (resolver) builder.symbolZIndex(resolver);
  return { reelSet: builder.build(), ticker };
}

describe('ReelSetBuilder.symbolZIndex', () => {
  it('rejects a non-function', () => {
    expect(() => new ReelSetBuilder().symbolZIndex('x' as unknown as SymbolZIndexResolver)).toThrow(/function/);
  });

  it('is asked with the reel, cell, rest state and the value the engine would have used', () => {
    const seen: SymbolZIndexContext[] = [];
    const { reelSet, ticker } = build((ctx) => {
      seen.push(ctx);
      return ctx.defaultZIndex;
    });
    const reel = reelSet.reels[0];
    const bufferStart = reel.bufferStart;
    const forWild = seen.find(
      (c) => c.symbolId === 'w' && c.reelIndex === 0 && c.arrayIndex === bufferStart + 1,
    )!;
    expect(forWild).toMatchObject({
      reelIndex: 0,
      reelCount: 3,
      arrayIndex: bufferStart + 1,
      visibleCell: 1,
      visibleCells: 3,
      atRest: true,
      defaultZIndex: 5 * Z_INDEX_BUDGET.symbolLayer + bufferStart + 1,
    });
    expect(forWild.symbolData.zIndex).toBe(5);
    // Buffer slots report no visible cell.
    const buffer = seen.find((c) => c.reelIndex === 0 && c.arrayIndex === 0)!;
    expect(buffer.visibleCell).toBeNull();
    // Without a resolver the formula is what lands on the view; with one
    // returning `defaultZIndex`, the same values.
    for (let i = 0; i < reel.symbols.length; i++) {
      const base = reel.symbols[i].symbolId === 'w' ? 5 : 1;
      expect(reel.symbols[i].view.zIndex).toBe(base * Z_INDEX_BUDGET.symbolLayer + i);
    }
    reelSet.destroy();
    ticker.destroy();
  });

  it('writes the returned value onto every symbol view', () => {
    const { reelSet, ticker } = build((ctx) => 1000 * ctx.reelIndex + ctx.arrayIndex);
    reelSet.reels.forEach((reel, reelIndex) => {
      reel.symbols.forEach((sym, i) => expect(sym.view.zIndex).toBe(1000 * reelIndex + i));
    });
    reelSet.destroy();
    ticker.destroy();
  });

  it('is re-asked when the reel leaves rest and when it lands, after the unmask lift', async () => {
    const atRestSeen: boolean[] = [];
    const { reelSet, ticker } = build((ctx) => {
      if (ctx.symbolId === 'w' && ctx.visibleCell !== null) atRestSeen.push(ctx.atRest);
      return ctx.atRest ? 7000 : 3;
    }, true);
    const reel = reelSet.reels[0];
    const wild = () => reel.getSymbolAt(1);
    // At rest from build: lifted and graded.
    expect(wild().view.parent).toBe(reelSet.viewport.unmaskedContainer);
    expect(wild().view.zIndex).toBe(7000);

    const spin = reelSet.spin();
    // The reel leaves rest on its first frame of motion, not inside `spin()`:
    // that re-masks the wild and re-asks with `atRest: false`.
    for (let i = 0; i < 3; i++) ticker.tick(16);
    expect(atRestSeen.at(-1)).toBe(false);
    expect(wild().view.parent).toBe(reel.container);
    expect(wild().view.zIndex).toBe(3);

    reelSet.setResult([
      { visible: ['w', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
    ]);
    reelSet.slamStop();
    await spin;
    // Landed: lifted again, and the refresh ran AFTER the lift.
    const landedWild = reel.getSymbolAt(0);
    expect(landedWild.symbolId).toBe('w');
    expect(landedWild.view.parent).toBe(reelSet.viewport.unmaskedContainer);
    expect(landedWild.view.zIndex).toBe(7000);
    expect(atRestSeen.at(-1)).toBe(true);
    reelSet.destroy();
    ticker.destroy();
  });

  it('publishes the reserved values', () => {
    expect(Z_INDEX_BUDGET).toEqual({ symbolLayer: 100, pinOverlay: 10000 });
  });
});
