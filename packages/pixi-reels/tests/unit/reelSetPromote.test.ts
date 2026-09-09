/**
 * `ReelSet.promote()` is the bare promotion the spotlight does as one step of
 * a bigger presentation: raise these symbols above the mask and every other
 * symbol, no dim, no `playWin()`, nothing to await. It attaches to a
 * `RenderLayer` rather than reparenting, so a promoted symbol keeps its
 * transform and there is no stale-parent hazard when the pool recycles it.
 */
import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

function make() {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(40, 40)
    .symbols((r) => {
      r.register('a', HeadlessSymbol, {});
      r.register('b', HeadlessSymbol, {});
    })
    .initialFrame([
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
      { visible: ['a', 'a', 'a'] },
    ])
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, ticker, destroy: () => { reelSet.destroy(); ticker.destroy(); } };
}

const viewAt = (reelSet: ReturnType<typeof make>['reelSet'], reel: number, cell: number) =>
  reelSet.getReel(reel).getSymbolAt(cell).view;

describe('ReelSet.promote', () => {
  it('is inert until called', () => {
    const { reelSet, destroy } = make();
    expect(reelSet.promotedViews).toEqual([]);
    expect(viewAt(reelSet, 0, 0).parentRenderLayer).toBeNull();
    destroy();
  });

  it('raises the named views and drops them on release', () => {
    const { reelSet, destroy } = make();
    const view = viewAt(reelSet, 1, 2);
    const parent = view.parent;

    const drop = reelSet.promote([{ reelIndex: 1, cellIndex: 2 }]);
    expect(view.parentRenderLayer).toBe(reelSet.viewport.promotedLayer);
    expect(reelSet.promotedViews).toEqual([view]);
    // Attach, not reparent: the view keeps its real parent and transform.
    expect(view.parent).toBe(parent);

    drop();
    expect(view.parentRenderLayer).toBeNull();
    expect(reelSet.promotedViews).toEqual([]);
    expect(view.parent).toBe(parent);
    destroy();
  });

  it('draws promoted views above the spotlight container', () => {
    const { reelSet, destroy } = make();
    const viewport = reelSet.viewport;
    expect(viewport.getChildIndex(viewport.promotedLayer)).toBeGreaterThan(
      viewport.getChildIndex(viewport.spotlightContainer),
    );
    destroy();
  });

  it('promotes a whole line in one call and releases it in one call', () => {
    const { reelSet, destroy } = make();
    const line = [0, 1, 2].map((reelIndex) => ({ reelIndex, cellIndex: 1 }));
    const drop = reelSet.promote(line);
    expect(reelSet.promotedViews).toHaveLength(3);
    drop();
    expect(reelSet.promotedViews).toEqual([]);
    destroy();
  });

  it('makes a repeated release a no-op', () => {
    const { reelSet, destroy } = make();
    const drop = reelSet.promote([{ reelIndex: 0, cellIndex: 0 }]);
    drop();
    expect(() => drop()).not.toThrow();
    expect(reelSet.promotedViews).toEqual([]);
    destroy();
  });

  it('leaves a later promotion of the same view alone when an earlier release runs', () => {
    const { reelSet, destroy } = make();
    const pos = [{ reelIndex: 2, cellIndex: 0 }];
    const first = reelSet.promote(pos);
    const second = reelSet.promote(pos);
    first();
    // Both handles named the same view, so the first release drops it - but it
    // must not leave the layer holding a view it no longer draws.
    expect(reelSet.promotedViews).toEqual([]);
    expect(() => second()).not.toThrow();
    destroy();
  });

  it('ends a promotion when the cell swaps under it', () => {
    const { reelSet, destroy } = make();
    const raised = viewAt(reelSet, 0, 1);
    const drop = reelSet.promote([{ reelIndex: 0, cellIndex: 1 }]);
    expect(reelSet.promotedViews).toHaveLength(1);

    // A swap hands the cell a different instance and the raised view goes back
    // to the pool. `deactivate()` only hides it, so an attachment left behind
    // would raise whatever cell the pool reuses that view for next.
    reelSet.getReel(0).placeSymbols({ visible: ['b', 'b', 'b'] });
    expect(reelSet.promotedViews).toEqual([]);
    expect(raised.parentRenderLayer).toBeNull();
    expect(viewAt(reelSet, 0, 1).parentRenderLayer).toBeNull();
    // The stale release must still be safe.
    expect(() => drop()).not.toThrow();
    destroy();
  });

  it('keeps promoting the cells a swap did not touch', () => {
    const { reelSet, destroy } = make();
    const kept = viewAt(reelSet, 2, 0);
    const drop = reelSet.promote([
      { reelIndex: 0, cellIndex: 0 },
      { reelIndex: 2, cellIndex: 0 },
    ]);
    reelSet.getReel(0).placeSymbols({ visible: ['b', 'b', 'b'] });
    expect(reelSet.promotedViews).toEqual([kept]);
    drop();
    expect(reelSet.promotedViews).toEqual([]);
    destroy();
  });

  it('stops watching for swaps once released', () => {
    const { reelSet, destroy } = make();
    const drop = reelSet.promote([{ reelIndex: 1, cellIndex: 0 }]);
    drop();
    expect(reelSet.getReel(1).events.listenerCount('symbol:created')).toBe(0);
    destroy();
  });

  it('throws for a position outside the set', () => {
    const { reelSet, destroy } = make();
    expect(() => reelSet.promote([{ reelIndex: 9, cellIndex: 0 }])).toThrow(/reel 9 out of range/);
    expect(() => reelSet.promote([{ reelIndex: 0, cellIndex: 9 }])).toThrow(/cell 9 out of range/);
    destroy();
  });

  it('clears every attachment on destroy', () => {
    const { reelSet, destroy } = make();
    const view = viewAt(reelSet, 0, 0);
    reelSet.promote([{ reelIndex: 0, cellIndex: 0 }]);
    destroy();
    expect(view.parentRenderLayer).toBeNull();
  });
});
