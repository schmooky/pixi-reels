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
import { gsap as defaultGsap } from 'gsap';
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
      await h.spinAndLand([ { visible: ['a', 'a', 'a'] }, { visible: ['a', 'wild', 'a'] }, { visible: ['a', 'a', 'a'] } ]);

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
      await h.spinAndLand([ { visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] } ]);

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
      // First spin: wild lands in middle cell of reel 1 -> unmasked.
      await h.spinAndLand([ { visible: ['a', 'a', 'a'] }, { visible: ['a', 'wild', 'a'] }, { visible: ['a', 'a', 'a'] } ]);
      const reel = h.reelSet.reels[1];
      expect(reel.getSymbolAt(1).view.parent).toBe(h.reelSet.viewport.unmaskedContainer);

      // Second spin: middle cell becomes a normal symbol -> must end up in reel.container.
      await h.spinAndLand([ { visible: ['b', 'b', 'b'] }, { visible: ['b', 'b', 'b'] }, { visible: ['b', 'b', 'b'] } ]);

      expect(reel.getSymbolAt(1).view.parent).toBe(reel.container);
    } finally {
      h.destroy();
    }
  });

  it('aligns unmasked X with the reel column so it visually overlaps the right cell', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([ { visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'wild'] } ]);

      const reel = h.reelSet.reels[2];
      const wildView = reel.getSymbolAt(2).view;

      // X in the unmaskedContainer must equal the reel's container.x so the
      // wild lines up under the rightmost reel column.
      expect(wildView.x).toBe(reel.container.x);
    } finally {
      h.destroy();
    }
  });

  it('Y on a flat (mainOffset=0) reel matches the cell position', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([ { visible: ['a', 'a', 'a'] }, { visible: ['a', 'wild', 'a'] }, { visible: ['a', 'a', 'a'] } ]);
      const reel = h.reelSet.reels[1];
      // Flat reel: container.y === 0, so the unmasked view's Y is just
      // cell * slotPitch. This is the path that's correct on flat slots.
      expect(reel.container.y).toBe(0);
      const wildView = reel.getSymbolAt(1).view;
      const slotH = reel.motion.slotPitch;
      expect(wildView.y).toBe(reel.container.y + 1 * slotH);
    } finally {
      h.destroy();
    }
  });
});

describe('unmask on a jagged / pyramid layout (non-zero reel mainOffset)', () => {
  function makePyramid() {
    return createTestReelSet({
      reels: 5,
      // Pyramid: the outer 3-cell reels are centred, giving non-zero mainOffset.
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
      // Reel 0 is a 3-cell reel -> non-zero mainOffset. Land a wild in its top cell.
      await h.spinAndLand([ { visible: ['wild', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] } ]);

      const reel = h.reelSet.reels[0];
      expect(reel.container.y).not.toBe(0); // it really is an offset reel
      const wildView = reel.getSymbolAt(0).view;
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);
      expect(wildView.x).toBe(reel.container.x);
      const slotH = reel.motion.slotPitch;
      // Top visible cell -> reel-local 0, so viewport Y is exactly the offset.
      expect(wildView.y).toBeCloseTo(reel.container.y + 0 * slotH, 3);
    } finally {
      h.destroy();
    }
  });

  it('keeps the reel offset baked in MID-NUDGE, not just at rest', async () => {
    // A nudge is the one path that runs `motion.advance()` while the reel is
    // at rest, so lifted views still exist. `advance()` re-derives every
    // position from the array index and writes it absolutely, which drops the
    // reel offset unless the sync runs on each tick. Before the fix the wild
    // jumped a full cell out of its column for the whole tween and snapped
    // back at the end.
    let onUpdate: (() => void) | null = null;
    const pausedGsap = {
      ...defaultGsap,
      to: (target: { p: number }, vars: { onUpdate?: () => void }) => {
        target.p = 0.4;
        onUpdate = vars.onUpdate ?? null;
        vars.onUpdate?.();
        return { kill: () => {}, progress: () => {} } as unknown as gsap.core.Tween;
      },
    } as unknown as typeof defaultGsap;

    const h = createTestReelSet({
      reels: 5,
      visibleCells: [3, 4, 5, 4, 3],
      symbolIds: SYMBOLS,
      symbolData: { wild: { unmask: true } },
      gsap: pausedGsap,
    });
    try {
      await h.spinAndLand([ { visible: ['wild', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] } ]);

      const reel = h.reelSet.reels[0];
      const offset = reel.container.y;
      expect(offset).not.toBe(0);
      const wildView = reel.getSymbolAt(0).view;
      expect(wildView.parent).toBe(h.reelSet.viewport.unmaskedContainer);

      // Never settles (the shim leaves the tween paused); `destroy()` rejects
      // it, so swallow that rather than leaking an unhandled rejection.
      h.reelSet.nudge(0, { distance: 1, direction: 'forward', incoming: ['b'] }).catch(() => {});
      expect(onUpdate, 'the nudge tween ran').not.toBeNull();

      // Mid-tween the lifted view must sit one partial cell below its at-rest
      // position, still carrying the reel offset - never at bare reel-local.
      const pitch = reel.motion.slotPitch;
      expect(wildView.y).toBeGreaterThan(offset - 1e-6);
      expect(wildView.y).toBeLessThan(offset + pitch + 1e-6);
    } finally {
      h.destroy();
    }
  });

  it('stays offset-correct after a second spin re-snaps the strip', async () => {
    const h = makePyramid();
    try {
      await h.spinAndLand([ { visible: ['wild', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] } ]);
      // Land another wild on the same offset reel. the motion layer's
      // absolute snap runs between spins; _syncUnmaskedViewOffsets must
      // re-bake container.y so the lifted view isn't jumped by the offset.
      await h.spinAndLand([ { visible: ['a', 'wild', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] } ]);

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

/**
 * `StopPhase` lifts landed unmask views in `notifyLanded()` and only THEN tweens
 * `reel.container` through the two-leg bounce. A lifted view sits in
 * `viewport.unmaskedContainer` with the reel offset baked into its own
 * coordinate, so it does not inherit that container motion and used to hang
 * still for the whole ~600 ms overshoot.
 *
 * Same clock trick as `reverseNaturalStop.test.ts`: GSAP is NOT wired to the
 * FakeTicker here, so the strip advances on ticker pumps while the bounce
 * advances on real wall time. Pumping both together runs a real bounce, which
 * is the only way to reach this code -- `spinAndLand`/`slamStop()` skip it.
 */
describe('unmask through the stop bounce', () => {
  it('a lifted unmask view tracks the reel for every frame of the bounce', async () => {
    const h = createTestReelSet({
      reels: 1,
      visibleCells: 3,
      symbolIds: SYMBOLS,
      weights: { a: 1, b: 1 },
      symbolData: { wild: { unmask: true } },
    });
    try {
      const reel = h.reelSet.reels[0];
      const spin = h.reelSet.spin();
      h.advance(200);
      h.reelSet.setResult([{ visible: ['a', 'wild', 'a'] }]);

      // Sample the lifted view against the reel on every pumped frame.
      let worstDrift = 0;
      let sawBounce = false;
      let liftedFrames = 0;
      let settled = false;
      const tracked = spin.finally(() => { settled = true; });
      const started = Date.now();
      while (!settled && Date.now() - started < 8000) {
        h.advance(16);
        const wild = reel.getSymbolAt(1);
        const view = wild.view;
        if (wild.symbolId === 'wild' && view.parent === h.reelSet.viewport.unmaskedContainer) {
          liftedFrames++;
          // The reel is off its rest position only while the bounce runs.
          if (Math.abs(reel.container.y) > 1) sawBounce = true;
          const expected = reel.container.y + 1 * reel.motion.slotPitch;
          worstDrift = Math.max(worstDrift, Math.abs(view.y - expected));
        }
        await new Promise((r) => setTimeout(r, 4));
      }
      await tracked;

      // Guard the guard: without these the drift assertion passes vacuously
      // on a run that never lifted anything or never left the rest position.
      expect(liftedFrames, 'sampled the wild while it was lifted').toBeGreaterThan(0);
      expect(sawBounce, 'sampled a frame with the reel mid-bounce').toBe(true);
      expect(worstDrift).toBeLessThan(0.001);
    } finally {
      h.destroy();
    }
  }, 20000);
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
      const winners = [{ reel: 1, cell: 2 }];
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
      // ...and at the top visible cell's viewport-local Y (reel-local 0 +
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
      // wild sits lifted at cell 0 (initialFrame is an at-rest landing).
      const winners = [{ reel: 1, cell: 2 }];
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

/**
 * Regression: an `unmask` symbol that lands in a BUFFER slot must stay under
 * the mask.
 *
 * `unmask` lifts a view out of the reel's masked container so it can render
 * above the mask. That is a presentation for a symbol the player is looking
 * at, i.e. a visible cell. The lift was decided from the symbol id alone, so
 * any at-rest write to a buffer slot lifted it too - and a buffer slot is
 * parked outside the window precisely because the mask should hide it. The
 * result was a symbol hanging above or below the grid until the next spin
 * pulled it back down.
 *
 * `StopPhase.onSkip` is the path that made it visible in a real game: the
 * skip lands the full strip (buffers included) through `placeStrip`, and if
 * the bounce has already started the reel is back at rest, so every buffered
 * unmask symbol lifted.
 */
describe('unmask never lifts a buffer cell', () => {
  const makeBufferHarness = () =>
    createTestReelSet({
      reels: 1,
      visibleCells: 3,
      symbolIds: SYMBOLS,
      bufferSymbols: 2,
      symbolData: { wild: { unmask: true } },
    });

  it('keeps a buffer-start / buffer-end wild masked when the strip is placed at rest', () => {
    const h = makeBufferHarness();
    try {
      const reel = h.reelSet.reels[0];
      reel.placeSymbols({
        visible: ['a', 'a', 'a'],
        bufferStart: ['wild'],
        bufferEnd: ['wild'],
      });

      expect(reel.symbols[1].symbolId).toBe('wild');
      expect(reel.symbols[1].view.parent).toBe(reel.container);
      const last = reel.symbols.length - 1;
      expect(reel.symbols[last - 1].symbolId).toBe('wild');
      expect(reel.symbols[last - 1].view.parent).toBe(reel.container);
    } finally {
      h.destroy();
    }
  });

  it('still lifts the visible cells of that same at-rest placement', () => {
    const h = makeBufferHarness();
    try {
      const reel = h.reelSet.reels[0];
      reel.placeSymbols({ visible: ['a', 'wild', 'a'], bufferStart: ['wild'] });

      expect(reel.getSymbolAt(1).view.parent).toBe(h.reelSet.viewport.unmaskedContainer);
      expect(reel.symbols[1].view.parent).toBe(reel.container);
    } finally {
      h.destroy();
    }
  });

  it('lands a skip during the bounce with the buffered wilds still masked', async () => {
    const h = makeBufferHarness();
    try {
      // Land once so the reel is at rest with a lifted wild, exactly the
      // state `onSkip` finds when the bounce has already begun.
      await h.spinAndLand([{ visible: ['a', 'wild', 'a'] }]);
      const reel = h.reelSet.reels[0];
      expect(reel.getSymbolAt(1).view.parent).toBe(h.reelSet.viewport.unmaskedContainer);

      // The skip path lands the FULL strip, buffers included.
      reel.placeStrip(['wild', 'a', 'a', 'a', 'a', 'wild', 'wild']);

      // Slots 0-1 and 5-6 are buffer; 2-4 are the window.
      for (const i of [0, 1, 5, 6]) {
        expect(reel.symbols[i].view.parent, `buffer slot ${i}`).toBe(reel.container);
      }
    } finally {
      h.destroy();
    }
  });

  it('re-masks a lifted wild that a nudge carried out of the window', async () => {
    const h = makeBufferHarness();
    try {
      await h.spinAndLand([{ visible: ['wild', 'a', 'a'] }]);
      const reel = h.reelSet.reels[0];
      const wild = reel.getSymbolAt(0);
      expect(wild.view.parent).toBe(h.reelSet.viewport.unmaskedContainer);

      // Nudge backward by one: the lifted wild rotates from visible cell 0
      // into the buffer above. Nothing replaces it, so only the settle can
      // put it back under the mask.
      await h.reelSet.nudge(0, { distance: 1, direction: 'reverse', incoming: ['b'] });

      expect(reel.symbols[1].symbolId).toBe('wild');
      expect(reel.symbols[1].view.parent).toBe(reel.container);
    } finally {
      h.destroy();
    }
  });
});
