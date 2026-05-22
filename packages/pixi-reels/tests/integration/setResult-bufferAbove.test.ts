/**
 * End-to-end tests for buffer-above and buffer-below target placement via
 * `setResult`. Drives the full public pipeline so the clones in
 * `ReelSet._applyPinsToGrid` and `SpinController._coordinateBigSymbols` are
 * actually exercised.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'wild', 'coin'];

function makeHarness() {
  return createTestReelSet({
    reels: 3,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

function topBufferSymbol(reel: ReturnType<typeof makeHarness>['reelSet']['reels'][number]): string {
  return reel.symbols[0].symbolId;
}

function bottomBufferSymbol(reel: ReturnType<typeof makeHarness>['reelSet']['reels'][number]): string {
  return reel.symbols[reel.symbols.length - 1].symbolId;
}

describe('setResult with ColumnTarget[]', () => {
  it('accepts { visible } as the equivalent of bare visible symbols', async () => {
    const h = makeHarness();
    try {
      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'] },
      ]);
      h.reelSet.slamStop();
      await spin;

      for (let r = 0; r < 3; r++) {
        expect(h.reelSet.reels[r].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
      }
    } finally {
      h.destroy();
    }
  });

  it('places bufferAbove[0] in the slot closest to the visible top row', async () => {
    const h = makeHarness();
    try {
      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
        { visible: ['a', 'b', 'c'] },
      ]);
      h.reelSet.slamStop();
      await spin;

      expect(topBufferSymbol(h.reelSet.reels[1])).toBe('coin');
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('places bufferBelow[0] in the slot closest to the visible bottom row', async () => {
    const h = makeHarness();
    try {
      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['wild'] },
        { visible: ['a', 'b', 'c'] },
      ]);
      h.reelSet.slamStop();
      await spin;

      expect(bottomBufferSymbol(h.reelSet.reels[1])).toBe('wild');
    } finally {
      h.destroy();
    }
  });

  it('survives a structuredClone round-trip', async () => {
    const h = makeHarness();
    try {
      const target = [
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
        { visible: ['a', 'b', 'c'] },
      ];
      const cloned = structuredClone(target);

      const spin = h.reelSet.spin();
      h.reelSet.setResult(cloned);
      h.reelSet.slamStop();
      await spin;

      expect(topBufferSymbol(h.reelSet.reels[1])).toBe('coin');
    } finally {
      h.destroy();
    }
  });

  it('preserves bufferAbove through the pin-overlay clone path', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild', { turns: 'permanent' });

      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
      ]);
      h.reelSet.slamStop();
      await spin;

      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('wild');
      expect(topBufferSymbol(h.reelSet.reels[2])).toBe('coin');
    } finally {
      h.destroy();
    }
  });

  it('preserves bufferAbove through the big-symbol coordinator clone path', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: [...SYMBOLS, 'big'],
      symbolData: {
        big: { size: { w: 2, h: 2 } },
      },
    });
    try {
      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['big', 'b', 'c'] },
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
      ]);
      h.reelSet.slamStop();
      await spin;

      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('big');
      expect(topBufferSymbol(h.reelSet.reels[2])).toBe('coin');
    } finally {
      h.destroy();
    }
  });
});
