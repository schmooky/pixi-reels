/**
 * A reel set destroyed while `runCascade()` is between steps.
 *
 * `ReelSet` keeps its typed bus in a field named `_events`, which shadows the
 * PixiJS Container's own. `destroy()` ends in `super.destroy()`, which resets
 * that field to PixiJS's listener store, so a `finally` that unsubscribed from
 * the bus afterwards threw `this._events.off is not a function` and replaced
 * whatever the round was settling with. A recipe that aborts its round in
 * cleanup, after the set is gone, hit it on every page teardown.
 */
import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

function build() {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(50, 50)
    .symbols((r) => {
      for (const id of ['a', 'b']) r.register(id, HeadlessSymbol, {});
    })
    .weights({ a: 1, b: 1 })
    .tumble({
      fall: { duration: 0, ease: 'none', cellStagger: 0 },
      dropIn: { duration: 0, ease: 'none', cellStagger: 0, distance: 'perHole' },
    })
    .initialFrame([{ visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] }])
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, ticker };
}

describe('destroying a reel set mid-cascade', () => {
  it('lets an abort after destroy() settle the round without a TypeError', async () => {
    const { reelSet, ticker } = build();
    const abort = new AbortController();
    let pausing!: () => void;
    const inPause = new Promise<void>((r) => { pausing = r; });
    let step = 0;
    const round = reelSet.runCascade({
      signal: abort.signal,
      pauseAfterDestroyMs: 10_000,
      detectWinners: () => (step++ === 0 ? [{ reel: 0, cell: 0 }] : []),
      nextGrid: (prev) => prev.map((reel) => ({ visible: [...reel] })),
      onCascade: () => { pausing(); },
    });
    const settled = round.then(() => 'resolved', (e: unknown) => e);
    for (let i = 0; i < 50 && step === 0; i++) ticker.tick(16);
    await Promise.race([inPause, new Promise((r) => setTimeout(r, 200))]);

    reelSet.destroy();
    abort.abort();
    const outcome = await settled;
    expect(outcome instanceof TypeError ? String(outcome) : 'no TypeError').toBe('no TypeError');
    ticker.destroy();
  });
});
