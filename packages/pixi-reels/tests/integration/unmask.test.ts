/**
 * Integration tests for `SymbolData.unmask: true`.
 *
 * Contract: when a registered symbol has `unmask: true`, its view is
 * parented to `viewport.unmaskedContainer` instead of the reel's masked
 * container. This makes the symbol render above the reel mask - useful
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
    visibleCells: 3,
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
      // First spin: wild lands in middle row of reel 1 -> unmasked.
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'wild', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[1];
      expect(reel.getSymbolAt(1).view.parent).toBe(h.reelSet.viewport.unmaskedContainer);

      // Second spin: middle row becomes a normal symbol -> must end up in reel.container.
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
      // row * slotPitch. This is the path that's correct on flat slots.
      expect(reel.container.y).toBe(0);
      const wildView = reel.getSymbolAt(1).view;
      const slotH = reel.motion.slotPitch;
      expect(wildView.y).toBe(reel.container.y + 1 * slotH);
    } finally {
      h.destroy();
    }
  });
});

describe('unmask on a jagged / pyramid layout (non-zero reel offsetY)', () => {
  function makePyramid() {
    return createTestReelSet({
      reels: 5,
      // Pyramid: the outer 3-row reels are centred, giving non-zero offsetY.
      visibleCells: [3, 4, 5, 4, 3],
      symbolIds: SYMBOLS,
      symbolData: { wild: { unmask: true } },
    });
  }

  it('builds without throwing', () => {
    expect(() => makePyramid()).not.toThrow();
  });

  it('lands an unmasked wild above the mask with the reel offset baked into Y', async () => {
    const h = makePyramid();
    try {
      // Reel 0 is a 3-row reel -> non-zero offsetY. Land a wild in its top row.
      await h.spinAndLand([
        ['wild', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);

      const reel = h.reelSet.reels[0];
      expect(reel.container.y).not.toBe(0); // it really is an offset reel
      const wildView = reel.getSymbolAt(0).view;
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);
      expect(wildView.x).toBe(reel.container.x);
      const slotH = reel.motion.slotPitch;
      // Top visible row -> reel-local 0, so viewport Y is exactly the offset.
      expect(wildView.y).toBeCloseTo(reel.container.y + 0 * slotH, 3);
    } finally {
      h.destroy();
    }
  });

  it('stays offset-correct after a second spin re-snaps the strip', async () => {
    const h = makePyramid();
    try {
      await h.spinAndLand([
        ['wild', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      // Land another wild on the same offset reel. the motion layer's
      // absolute snap runs between spins; _syncUnmaskedViewOffsets must
      // re-bake container.y so the lifted view isn't jumped by the offset.
      await h.spinAndLand([
        ['a', 'wild', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);

      const reel = h.reelSet.reels[0];
      const wildView = reel.getSymbolAt(1).view;
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);
      const slotH = reel.motion.slotPitch;
      expect(wildView.y).toBeCloseTo(reel.container.y + 1 * slotH, 3);
    } finally {
      h.destroy();
    }
  });
});

// Cascade refill path
//
// `StartPhase` re-masks lifted views the instant a strip spin launches
// (and `notifySpinStart` safety-nets the tumble fall path), but a pure
// `refill()` never passes through either: CascadePlacePhase installs the
// next grid and CascadeDropInPhase repositions views with REEL-LOCAL Y
// while a lifted unmask view sits in viewport coordinates. Without a
// re-mask at the start of the refill pipeline, an unmask symbol arriving
// via drop-in is lifted at place time and then parked at the wrong Y
// (off by the reel container offset). floating above its cell.
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { Ticker } from 'pixi.js';

function makeTumbleHarness(initialFrame: string[][]) {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(initialFrame.length)
    .visibleCells(initialFrame[0].length)
    .symbolSize(50, 50)
    .symbols((r) => {
      for (const id of ['a', 'b', 'wild']) r.register(id, HeadlessSymbol, {});
    })
    .weights({ a: 1, b: 1 })
    .symbolData({ wild: { unmask: true } })
    .tumble({
      fall:   { duration: 0, ease: 'none', cellStagger: 0 },
      dropIn: { duration: 0, ease: 'none', cellStagger: 0, distance: 'perHole' },
    })
    .initialFrame(initialFrame.map((visible) => ({ visible })))
    .ticker(ticker as unknown as Ticker)
    .build();
  return {
    reelSet,
    destroy: () => { reelSet.destroy(); ticker.destroy(); },
  };
}

describe('unmask through the cascade refill path', () => {
  it('an unmask symbol arriving via refill drop-in lands lifted at its cell Y', async () => {
    const h = makeTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      const winners = [{ reel: 1, row: 2 }];
      const reel = h.reelSet.reels[1];

      // The moment the drop-in starts, its movers sit pre-positioned
      // ABOVE the viewport (negative reel-local Y). An unmask mover must
      // be re-masked for that travel: lifted, it would render its whole
      // above-grid approach outside the mask. floating over the page.
      let dropInParentWasMasked: boolean | null = null;
      h.reelSet.events.on('cascade:dropIn:start', (info) => {
        if (info.reelIndex !== 1) return;
        const sym = reel.getSymbolAt(0); // the arriving wild
        dropInParentWasMasked = sym.view.parent === reel.container;
      });

      await h.reelSet.destroySymbols(winners);
      await h.reelSet.refill({
        winners,
        grid: [
          { visible: ['a', 'a', 'a'] },
          { visible: ['wild', 'a', 'a'] }, // new arrival at the top
          { visible: ['a', 'a', 'a'] },
        ],
      });

      // During the drop-in the wild was inside the masked container.
      expect(dropInParentWasMasked).toBe(true);
      expect(reel.getVisibleSymbols()[0]).toBe('wild');
      const wildView = reel.getSymbolAt(0).view;
      // At rest after the refill: lifted above the mask...
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);
      // ...and at the top visible row's viewport-local Y (reel-local 0 +
      // the reel container offset). NOT floating above the grid.
      expect(wildView.y).toBeCloseTo(reel.container.y + 0 * reel.motion.slotPitch, 3);
      expect(wildView.x).toBe(reel.container.x);
    } finally {
      h.destroy();
    }
  });

  it('a lifted survivor stays cell-aligned through a refill on its own reel', async () => {
    const h = makeTumbleHarness([
      ['a', 'a', 'a'],
      ['wild', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);
    try {
      // wild sits lifted at row 0 (initialFrame is an at-rest landing).
      const winners = [{ reel: 1, row: 2 }];
      await h.reelSet.destroySymbols(winners);
      await h.reelSet.refill({
        winners,
        grid: [
          { visible: ['a', 'a', 'a'] },
          { visible: ['b', 'wild', 'a'] }, // survivor slides 0 -> 1
          { visible: ['a', 'a', 'a'] },
        ],
      });

      const reel = h.reelSet.reels[1];
      expect(reel.getVisibleSymbols()[1]).toBe('wild');
      const wildView = reel.getSymbolAt(1).view;
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);
      expect(wildView.y).toBeCloseTo(reel.container.y + 1 * reel.motion.slotPitch, 3);
    } finally {
      h.destroy();
    }
  });
});
