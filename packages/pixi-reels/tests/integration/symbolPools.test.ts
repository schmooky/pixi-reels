/**
 * Symbol pools: what the engine is allowed to draw when it fills a cell the
 * game did not name.
 *
 * Two questions a game has to be able to answer and could not before:
 *   - "this symbol may spin, but it must never sit in the buffer cells
 *     above and below the window" (`{ slots: 'buffer' }`), and
 *   - "reel 3 draws from a different table than the rest" (`{ reel: 3 }`).
 *
 * Both are asserted through a real `ReelSet`, not the provider alone, so a
 * call site that forgets to pass its reel index fails here.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Reel } from '../../src/core/Reel.js';

const SYMBOLS = ['a', 'b', 'coin'];
/** Everything random comes up 'coin' unless a pool forbids it. */
const WEIGHTS = { a: 1, b: 1, coin: 5000 };

function makeHarness() {
  return createTestReelSet({
    reels: 3,
    visibleCells: 3,
    symbolIds: SYMBOLS,
    weights: WEIGHTS,
    bufferSymbols: 2,
  });
}

const bufferIds = (reel: Reel): string[] => [...startIds(reel), ...endIds(reel)];
const startIds = (reel: Reel): string[] => reel.symbols.slice(0, 2).map((s) => s.symbolId);
const endIds = (reel: Reel): string[] => reel.symbols.slice(-2).map((s) => s.symbolId);

describe('buffer pools decide what may sit above and below the window', () => {
  it('keeps an excluded symbol out of the buffers while leaving the strip alone', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'buffer' });
      // Land a grid with no explicit buffer targets, so every buffer cell is
      // a random draw. Without the pool all of them come up 'coin'.
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      for (const reel of h.reelSet.reels) {
        expect(bufferIds(reel)).not.toContain('coin');
      }
    } finally {
      h.destroy();
    }
  });

  it('still lets the game place that symbol in a buffer cell explicitly', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'buffer' });
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'], bufferStart: ['coin'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      // A pool governs the RANDOM draw. an explicit target is the game
      // speaking, and it wins.
      expect(h.reelSet.reels[0].symbols[1].symbolId).toBe('coin');
    } finally {
      h.destroy();
    }
  });

  it('a buffer pool does not narrow the visible cells a skip random-fills', () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'buffer' });
      const reel = h.reelSet.reels[0];
      // Undefined entries are random-filled by placeStrip: buffer slots
      // follow the buffer pool, visible cells follow the spinning one.
      reel.placeStrip([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);

      expect(bufferIds(reel)).not.toContain('coin');
      expect(reel.getVisibleSymbols()).toEqual(['coin', 'coin', 'coin']);
    } finally {
      h.destroy();
    }
  });

  it('can be configured at build time, so even the initial strip obeys it', () => {
    const set = new ReelSetBuilder()
      .reels(2)
      .visibleCells(3)
      .symbolSize(120, 100)
      .bufferSymbols(2)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => {
        for (const id of SYMBOLS) r.register(id, HeadlessSymbol, {});
      })
      .weights(WEIGHTS)
      .randomSymbols({ exclude: ['coin'] }, { slots: 'buffer' })
      .build();
    try {
      for (const reel of set.reels) {
        expect(bufferIds(reel)).not.toContain('coin');
        expect(reel.getVisibleSymbols()).toEqual(['coin', 'coin', 'coin']);
      }
    } finally {
      set.destroy();
    }
  });
});

describe('the two buffer ends can be controlled separately', () => {
  it('keeps a symbol out of the cells above the window only', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'bufferStart' });
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      for (const reel of h.reelSet.reels) {
        expect(startIds(reel), `reel ${reel.reelIndex} start`).not.toContain('coin');
      }
      // The other end is untouched: on a coin-heavy table it still fills.
      expect(h.reelSet.reels.flatMap((r) => endIds(r))).toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('keeps a symbol out of the cells below the window only', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'bufferEnd' });
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      for (const reel of h.reelSet.reels) {
        expect(endIds(reel), `reel ${reel.reelIndex} end`).not.toContain('coin');
      }
      expect(h.reelSet.reels.flatMap((r) => startIds(r))).toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('scopes one end of one reel', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { reel: 2, slots: 'bufferEnd' });
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      expect(endIds(h.reelSet.reels[2])).not.toContain('coin');
      expect(startIds(h.reelSet.reels[2])).toContain('coin');
      expect(endIds(h.reelSet.reels[0])).toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('applies the entering end when a nudge wraps symbols in', async () => {
    const h = makeHarness();
    try {
      // On a vertical forward set, a 'forward' nudge feeds new cells in at
      // the buffer-start end (`travelSign * polarity > 0`), so the padding
      // the queue draws for the off-window slots is a bufferStart draw.
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'bufferStart' });
      await h.reelSet.nudge(0, { distance: 2, direction: 'forward', incoming: ['a', 'a'] });
      expect(startIds(h.reelSet.reels[0])).not.toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('applies the other end when the nudge feeds from there', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'bufferEnd' });
      await h.reelSet.nudge(0, { distance: 2, direction: 'reverse', incoming: ['a', 'a'] });
      expect(endIds(h.reelSet.reels[0])).not.toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('build-time form takes a side too', () => {
    const set = new ReelSetBuilder()
      .reels(2)
      .visibleCells(3)
      .symbolSize(120, 100)
      .bufferSymbols(2)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => {
        for (const id of SYMBOLS) r.register(id, HeadlessSymbol, {});
      })
      .weights(WEIGHTS)
      .randomSymbols({ exclude: ['coin'] }, { slots: 'bufferStart' })
      .build();
    try {
      for (const reel of set.reels) {
        expect(startIds(reel)).not.toContain('coin');
      }
      expect(set.reels.flatMap((r) => endIds(r))).toContain('coin');
    } finally {
      set.destroy();
    }
  });
});

describe('per-reel pools narrow one reel without touching the others', () => {
  it('excludes a symbol from the spinning strip of one reel only', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { reel: 1 });
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      // Reel 1's buffers inherit its spinning ban; its neighbours don't.
      expect(bufferIds(h.reelSet.reels[1])).not.toContain('coin');
      expect(bufferIds(h.reelSet.reels[0])).toContain('coin');
      expect(bufferIds(h.reelSet.reels[2])).toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('applies per-reel weights to the symbols that stream past mid-spin', () => {
    const h = makeHarness();
    try {
      // Reel 0 draws 'a' only; every other reel keeps the coin-heavy table.
      h.reelSet.randomSymbols.set({ weights: { coin: 0, b: 0 } }, { reel: 0 });

      // The mid-spin refill happens on wrap, and the phase ramp that gets a
      // reel there runs on gsap's own clock - which the FakeTicker does not
      // drive. Drive the motion layer directly instead: the wrap callback is
      // the code path under test, and this is the only way to see it before
      // the stop sequencer takes over the feed.
      for (const reel of h.reelSet.reels) {
        reel.beginMotion();
        const step = reel.motion.slotPitch * 0.45;
        for (let i = 0; i < 60; i++) reel.motion.advance(step);
      }

      const spun = h.reelSet.reels[0].symbols.map((s) => s.symbolId);
      expect(new Set(spun)).toEqual(new Set(['a']));
      expect(h.reelSet.reels[2].symbols.map((s) => s.symbolId)).toContain('coin');
    } finally {
      h.destroy();
    }
  });

  it('reports the effective table per scope so a game can assert its own config', () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] }, { slots: 'buffer' });
      h.reelSet.randomSymbols.set({ weights: { a: 99 } }, { reel: 2 });

      expect(h.reelSet.randomSymbols.weights({ reel: 2 })).toEqual({
        a: 99,
        b: 1,
        coin: 5000,
      });
      expect(h.reelSet.randomSymbols.weights({ reel: 2, slots: 'buffer' })).toEqual({
        a: 99,
        b: 1,
        coin: 0,
      });
    } finally {
      h.destroy();
    }
  });

  it('clear() puts every reel back on the built-in weights', async () => {
    const h = makeHarness();
    try {
      h.reelSet.randomSymbols.set({ exclude: ['coin'] });
      h.reelSet.randomSymbols.clear();
      await h.spinAndLand([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      expect(bufferIds(h.reelSet.reels[0])).toContain('coin');
    } finally {
      h.destroy();
    }
  });
});
