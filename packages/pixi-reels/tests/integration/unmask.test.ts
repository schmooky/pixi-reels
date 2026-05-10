/**
 * Integration tests for `SymbolData.unmask: true`.
 *
 * Contract: when a registered symbol has `unmask: true`, its view is
 * parented to `viewport.unmaskedContainer` instead of the reel's masked
 * container. This makes the symbol render above the reel mask — useful
 * for oversized win animations.
 *
 * The reparenting must apply both at:
 *   - `placeSymbols` (skip / turbo / cascade landing path), and
 *   - normal stop landing once the target frame settles.
 *
 * The X position must match the reel's column (since unmaskedContainer
 * sits at viewport-local 0,0). The Y must include the reel's container
 * offset so the at-rest cell position is correct in viewport coords.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'wild', 'b'];

function makeHarness() {
  return createTestReelSet({
    reels: 3,
    visibleRows: 3,
    symbolIds: SYMBOLS,
    symbolData: {
      wild: { unmask: true },
    },
  });
}

describe('unmask: true reparents the symbol view to viewport.unmaskedContainer', () => {
  it('a wild that lands in a cell sits in the unmasked container', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);

      const reel = h.reelSet.reels[1];
      const visible = reel.getVisibleSymbols();
      expect(visible[1]).toBe('wild');

      const wildView = reel.getSymbolAt(1).view;
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);
    } finally {
      h.destroy();
    }
  });

  it('a normal symbol still sits in the reel container (the masked layer)', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);

      const reel = h.reelSet.reels[0];
      const view = reel.getSymbolAt(0).view;
      expect(view.parent).toBe(reel.container);
    } finally {
      h.destroy();
    }
  });

  it('reparents back to the reel when an unmasked symbol is replaced by a masked one', async () => {
    const h = makeHarness();
    try {
      // First spin: wild lands in middle row of reel 1 → unmasked.
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[1];
      expect(reel.getSymbolAt(1).view.parent).toBe(h.reelSet.viewport.unmaskedContainer);

      // Second spin: middle row becomes a normal symbol → must end up in reel.container.
      await h.spinAndLand([
        ['b', 'b', 'b'],
        ['b', 'b', 'b'],
        ['b', 'b', 'b'],
      ]);

      expect(reel.getSymbolAt(1).view.parent).toBe(reel.container);
    } finally {
      h.destroy();
    }
  });

  it('aligns unmasked X with the reel column so it visually overlaps the right cell', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'wild'],
      ]);

      const reel = h.reelSet.reels[2];
      const wildView = reel.getSymbolAt(2).view;

      // X in the unmaskedContainer must equal the reel's container.x so the
      // wild lines up under the rightmost reel column.
      expect(wildView.x).toBe(reel.container.x);
    } finally {
      h.destroy();
    }
  });

  it('Y on a flat (offsetY=0) reel matches the cell position', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[1];
      // Flat reel: container.y === 0, so the unmasked view's Y is just
      // row * slotHeight. This is the path that's correct on flat slots.
      expect(reel.container.y).toBe(0);
      const wildView = reel.getSymbolAt(1).view;
      const slotH = reel.motion.slotHeight;
      expect(wildView.y).toBe(reel.container.y + 1 * slotH);
    } finally {
      h.destroy();
    }
  });
});

describe('unmask + pyramid layout fails fast at build()', () => {
  it('throws when a pyramid reel set registers any unmasked symbol', () => {
    expect(() =>
      createTestReelSet({
        reels: 5,
        // Pyramid: differing visibleRows produces non-zero reel.offsetY.
        visibleRows: [3, 4, 5, 4, 3],
        symbolIds: SYMBOLS,
        symbolData: { wild: { unmask: true } },
      }),
    ).toThrow(/unmask \+ pyramid layout is not supported/);
  });

  it('does not throw on a flat layout with unmasked symbols', () => {
    expect(() =>
      createTestReelSet({
        reels: 5,
        visibleRows: 3,
        symbolIds: SYMBOLS,
        symbolData: { wild: { unmask: true } },
      }),
    ).not.toThrow();
  });
});
