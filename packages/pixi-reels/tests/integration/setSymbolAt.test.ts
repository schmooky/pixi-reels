/**
 * Integration tests for `Reel.setSymbolAt(visibleRow, id)` — the public
 * single-cell swap API.
 *
 * Contract: the row's symbol identity changes immediately, the new
 * symbol's view is correctly parented and zIndex'd, the rest of the
 * reel is untouched, and a `symbol:created` event fires.
 */
import { describe, it, expect, vi } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'wild'];

function makeHarness() {
  return createTestReelSet({
    reels: 3,
    visibleRows: 3,
    symbolIds: SYMBOLS,
    symbolData: {
      wild: { zIndex: 5 },
    },
  });
}

describe('Reel.setSymbolAt', () => {
  it('swaps a visible row in-place', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);

      h.reelSet.reels[1].setSymbolAt(1, 'wild');

      expect(h.reelSet.reels[1].getVisibleSymbols()[1]).toBe('wild');
    } finally {
      h.destroy();
    }
  });

  it('emits symbol:created on the per-reel event bus', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[2];
      const fn = vi.fn();
      reel.events.on('symbol:created', fn);

      reel.setSymbolAt(0, 'wild');

      expect(fn).toHaveBeenCalledWith('wild', reel.bufferAbove + 0);
    } finally {
      h.destroy();
    }
  });

  it('leaves other rows untouched', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[0];
      const before = reel.getVisibleSymbols();

      reel.setSymbolAt(1, 'b');

      const after = reel.getVisibleSymbols();
      expect(after[0]).toBe(before[0]);
      expect(after[1]).toBe('b');
      expect(after[2]).toBe(before[2]);
    } finally {
      h.destroy();
    }
  });

  it('throws on out-of-range row', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[0];

      expect(() => reel.setSymbolAt(-1, 'a')).toThrow(/out of range/);
      expect(() => reel.setSymbolAt(99, 'a')).toThrow(/out of range/);
      expect(() => reel.setSymbolAt(1.5, 'a')).toThrow(/out of range/);
    } finally {
      h.destroy();
    }
  });

  it('throws on unregistered symbol id', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[0];

      expect(() => reel.setSymbolAt(1, 'nonexistent')).toThrow(/not registered/);
    } finally {
      h.destroy();
    }
  });

  it('throws when called while reel is moving', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const reel = h.reelSet.reels[0];
      // The reel exposes `speed` and `isStopping` as the in-motion
      // markers; setSymbolAt's guard checks both. Toggle each in turn
      // and confirm the guard fires, then restore.
      reel.speed = 5;
      expect(() => reel.setSymbolAt(0, 'wild')).toThrow(/cannot swap mid-motion/);
      reel.speed = 0;

      reel.isStopping = true;
      expect(() => reel.setSymbolAt(0, 'wild')).toThrow(/cannot swap mid-motion/);
      reel.isStopping = false;

      // After clearing both, the swap goes through.
      reel.setSymbolAt(0, 'wild');
      expect(reel.getVisibleSymbols()[0]).toBe('wild');
    } finally {
      h.destroy();
    }
  });
});

describe('ReelSet.setSymbolAt', () => {
  it('delegates to the reel and swaps the cell', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      h.reelSet.setSymbolAt(1, 1, 'wild');
      expect(h.reelSet.getVisibleGrid()[1][1]).toBe('wild');
    } finally {
      h.destroy();
    }
  });

  it('throws on out-of-range column', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      expect(() => h.reelSet.setSymbolAt(-1, 0, 'a')).toThrow(/out of range/);
      expect(() => h.reelSet.setSymbolAt(99, 0, 'a')).toThrow(/out of range/);
    } finally {
      h.destroy();
    }
  });

  it('refuses to overwrite a pinned cell', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      h.reelSet.pin(1, 1, 'wild');
      expect(() => h.reelSet.setSymbolAt(1, 1, 'b')).toThrow(/has an active pin/);
      // After unpin, the same call should succeed.
      h.reelSet.unpin(1, 1);
      h.reelSet.setSymbolAt(1, 1, 'b');
      expect(h.reelSet.getVisibleGrid()[1][1]).toBe('b');
    } finally {
      h.destroy();
    }
  });
});
