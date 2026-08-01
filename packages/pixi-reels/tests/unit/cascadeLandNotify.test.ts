import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { ReelSet } from '../../src/index.js';

/**
 * Cascade refills must only notify landing on symbols that actually
 * MOVED (survivors that slid, new arrivals). An untouched survivor
 * (offsetCells 0) replaying its landing animation on every cascade
 * stage reads as the whole board twitching after each pop.
 */
class CountingSymbol extends HeadlessSymbol {
  landedCount = 0;
  override onReelLanded(): void {
    this.landedCount += 1;
  }
}

function landedAt(reelSet: ReelSet, reel: number, row: number): number {
  return (reelSet.reels[reel].getSymbolAt(row) as CountingSymbol).landedCount;
}

function buildHarness(initialFrame: string[][]): { reelSet: ReelSet; destroy: () => void } {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(initialFrame.length)
    .visibleCells(initialFrame[0].length)
    .symbolSize(50, 50)
    .symbols((r) => {
      for (const id of ['a', 'b', 'x']) r.register(id, CountingSymbol, {});
    })
    .weights({ a: 1, b: 1 })
    .tumble({
      fall:   { duration: 0, ease: 'none', cellStagger: 0 },
      dropIn: { duration: 0, ease: 'none', cellStagger: 0, distance: 'perHole' },
    })
    .initialFrame(initialFrame.map((visible) => ({ visible })))
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, destroy: () => { reelSet.destroy(); ticker.destroy(); } };
}

describe('cascade refill. landing notification is movers-only', () => {
  it('untouched survivors and untouched reels do not re-land', async () => {
    const h = buildHarness([
      ['a', 'a', 'a'],
      ['x', 'a', 'b'],
      ['a', 'a', 'a'],
    ]);
    try {
      const winners = [{ reel: 1, row: 0 }];
      await h.reelSet.destroySymbols(winners);
      await h.reelSet.refill({
        winners,
        grid: [
          { visible: ['a', 'a', 'a'] },
          { visible: ['b', 'a', 'b'] }, // new arrival at row 0; cells 1-2 stay
          { visible: ['a', 'a', 'a'] },
        ],
      });

      // The new arrival landed once.
      expect(landedAt(h.reelSet, 1, 0)).toBe(1);
      // Untouched survivors on the same reel: no re-land.
      expect(landedAt(h.reelSet, 1, 1)).toBe(0);
      expect(landedAt(h.reelSet, 1, 2)).toBe(0);
      // Reels with no winners at all: nothing lands.
      for (const reel of [0, 2]) {
        for (const row of [0, 1, 2]) {
          expect(landedAt(h.reelSet, reel, row)).toBe(0);
        }
      }
    } finally {
      h.destroy();
    }
  });

  it('sliding survivors DO land (they moved)', async () => {
    const h = buildHarness([
      ['a', 'a', 'a'],
      ['b', 'a', 'x'],
      ['a', 'a', 'a'],
    ]);
    try {
      // Winner at the BOTTOM row: cells 0-1 slide down, plus one new arrival.
      const winners = [{ reel: 1, row: 2 }];
      await h.reelSet.destroySymbols(winners);
      await h.reelSet.refill({
        winners,
        grid: [
          { visible: ['a', 'a', 'a'] },
          { visible: ['a', 'b', 'a'] }, // new at 0; old cells 0,1 slid to 1,2
          { visible: ['a', 'a', 'a'] },
        ],
      });

      expect(landedAt(h.reelSet, 1, 0)).toBe(1); // new arrival
      expect(landedAt(h.reelSet, 1, 1)).toBe(1); // slid survivor
      expect(landedAt(h.reelSet, 1, 2)).toBe(1); // slid survivor
    } finally {
      h.destroy();
    }
  });

  it('strip spins still notify every visible symbol', async () => {
    const h = buildHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      const p = h.reelSet.spin({ mode: 'standard' });
      h.reelSet.setResult([
        { visible: ['b', 'a', 'b'] },
        { visible: ['a', 'b', 'a'] },
        { visible: ['b', 'a', 'b'] },
      ]);
      h.reelSet.skipSpin();
      await p;
      for (let reel = 0; reel < 3; reel++) {
        for (let row = 0; row < 3; row++) {
          expect(landedAt(h.reelSet, reel, row)).toBeGreaterThanOrEqual(1);
        }
      }
    } finally {
      h.destroy();
    }
  });
});
