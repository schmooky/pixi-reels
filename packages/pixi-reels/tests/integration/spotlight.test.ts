/**
 * SymbolSpotlight integration tests — focused on the parent-restoration
 * invariant that broke when symbols were pool-recycled across reels mid-
 * spotlight.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'wild'];

function makeHarness() {
  return createTestReelSet({
    reels: 5,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

describe('SymbolSpotlight — symbol parent invariant after recycling', () => {
  it('does not yank recycled symbols back to a stale parent (promoteAboveMask: false)', async () => {
    const h = makeHarness();
    try {
      // Land a grid where reel 0 has a winner.
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['wild', 'wild', 'wild'],
        ['a', 'b', 'c'],
      ]);

      // Fire a spotlight on reel 0 row 1. The ReelSet uses a shared symbol
      // pool — the 'a' instance at reel 0 may end up reused on a different
      // reel after the next placeSymbols call.
      await h.reelSet.spotlight.show(
        [{ reelIndex: 0, rowIndex: 1 }],
        { promoteAboveMask: false },
      );

      // Land a different grid. Each reel's placeSymbols releases its old
      // symbols to the pool and acquires fresh ones — guaranteeing the 'a'
      // instance from reel 0 row 1 gets reassigned somewhere else.
      await h.spinAndLand([
        ['c', 'c', 'c'],
        ['c', 'c', 'c'],
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['wild', 'wild', 'wild'],
      ]);

      // Calling show() (or hide() directly) re-runs spotlight cleanup.
      // Before the fix, this reparented the recycled 'a' instance back to
      // reel 0's container, leaving a hole on whichever reel now owns it
      // and a stranger inside reel 0's container.
      await h.reelSet.spotlight.show(
        [{ reelIndex: 4, rowIndex: 0 }],
        { promoteAboveMask: false },
      );
      h.reelSet.spotlight.hide();

      // Invariant: every symbol's view.parent matches the container of the
      // reel that owns it in `reels[i].symbols`.
      for (let r = 0; r < 5; r++) {
        const reel = h.reelSet.reels[r];
        for (let i = 0; i < reel.symbols.length; i++) {
          const sym = reel.symbols[i];
          expect(sym.view.parent, `reel ${r} symbol[${i}] (${sym.symbolId}) parent`)
            .toBe(reel.container);
        }
      }
    } finally {
      h.destroy();
    }
  });

  it('does not yank recycled symbols back to a stale parent (promoteAboveMask: true)', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['wild', 'wild', 'wild'],
        ['a', 'b', 'c'],
      ]);

      // Synchronously call show + immediately recycle by landing a new grid
      // — the show's promoteAboveMask: true path stashes the promoted view
      // in spotlightContainer, but if a follow-up placeSymbols (or the
      // pool) yanks it back into a reel before hide() runs, hide() must
      // not steal it from the new owner.
      h.reelSet.spotlight.show(
        [{ reelIndex: 0, rowIndex: 1 }],
        { promoteAboveMask: true, playWinAnimation: false },
      );
      // Land a different grid that will exercise placeSymbols on every reel.
      await h.spinAndLand([
        ['c', 'c', 'c'],
        ['c', 'c', 'c'],
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['wild', 'wild', 'wild'],
      ]);
      h.reelSet.spotlight.hide();

      for (let r = 0; r < 5; r++) {
        const reel = h.reelSet.reels[r];
        for (let i = 0; i < reel.symbols.length; i++) {
          const sym = reel.symbols[i];
          expect(sym.view.parent, `reel ${r} symbol[${i}] (${sym.symbolId}) parent`)
            .toBe(reel.container);
        }
      }
    } finally {
      h.destroy();
    }
  });

  it('still restores promoted symbols when promoteAboveMask: true (regression)', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['wild', 'wild', 'wild'],
        ['a', 'b', 'c'],
      ]);

      const reel0 = h.reelSet.reels[0];
      const beforeSym = reel0.getSymbolAt(1);
      const beforeParent = beforeSym.view.parent;

      await h.reelSet.spotlight.show(
        [{ reelIndex: 0, rowIndex: 1 }],
        { promoteAboveMask: true },
      );

      // While promoted, the symbol is in the spotlight container.
      expect(beforeSym.view.parent).not.toBe(beforeParent);

      h.reelSet.spotlight.hide();

      // Hide restores it to the original reel container.
      expect(beforeSym.view.parent).toBe(beforeParent);
    } finally {
      h.destroy();
    }
  });
});
