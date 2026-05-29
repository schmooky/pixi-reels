/**
 * SymbolSpotlight integration tests — focused on the parent-restoration
 * invariant that broke when symbols were pool-recycled across reels mid-
 * spotlight.
 */
import { describe, it, expect, vi } from 'vitest';
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

describe('SymbolSpotlight.cycle', () => {
  it('shows every win line for the configured duration (not just the first)', async () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: SYMBOLS });
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['wild', 'wild', 'wild'],
        ['a', 'b', 'c'],
      ]);

      const lineOneSym = h.reelSet.reels[0].getSymbolAt(0);
      const lineTwoSym = h.reelSet.reels[1].getSymbolAt(0);
      const spyOne = vi.spyOn(lineOneSym, 'playWin');
      const spyTwo = vi.spyOn(lineTwoSym, 'playWin');

      const lines = [
        { positions: [{ reelIndex: 0, rowIndex: 0 }] },
        { positions: [{ reelIndex: 1, rowIndex: 0 }] },
      ];

      vi.useFakeTimers();
      try {
        const done = h.reelSet.spotlight.cycle(lines, {
          displayDuration: 100,
          gapDuration: 50,
          cycles: 1,
          promoteAboveMask: false,
        });
        // line1 (display+gap) + line2 (display+gap) = 300ms; advance past it.
        await vi.advanceTimersByTimeAsync(400);
        await done;
      } finally {
        vi.useRealTimers();
      }

      // Before the fix, cycle() aborted its own signal on the first show() and
      // never reached the second line, so spyTwo would be 0.
      expect(spyOne).toHaveBeenCalledTimes(1);
      expect(spyTwo).toHaveBeenCalledTimes(1);
      // Cycle fully torn down at the end.
      expect(h.reelSet.spotlight.isActive).toBe(false);
    } finally {
      h.destroy();
    }
  });

  it('hide() interrupts a running cycle promptly', async () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: SYMBOLS });
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
        ['wild', 'wild', 'wild'],
        ['a', 'b', 'c'],
      ]);

      const lineTwoSym = h.reelSet.reels[1].getSymbolAt(0);
      const spyTwo = vi.spyOn(lineTwoSym, 'playWin');

      const lines = [
        { positions: [{ reelIndex: 0, rowIndex: 0 }] },
        { positions: [{ reelIndex: 1, rowIndex: 0 }] },
      ];

      vi.useFakeTimers();
      try {
        const done = h.reelSet.spotlight.cycle(lines, {
          displayDuration: 1000,
          gapDuration: 50,
          cycles: -1, // infinite — must be stoppable
          promoteAboveMask: false,
        });
        await vi.advanceTimersByTimeAsync(10); // inside line 1's display window
        h.reelSet.spotlight.hide();
        await vi.advanceTimersByTimeAsync(5000);
        await done; // resolves because hide() aborted the cycle
      } finally {
        vi.useRealTimers();
      }

      expect(spyTwo).not.toHaveBeenCalled();
      expect(h.reelSet.spotlight.isActive).toBe(false);
    } finally {
      h.destroy();
    }
  });
});
