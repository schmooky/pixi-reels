/**
 * End-to-end tests for buffer-above (and buffer-below) target placement via
 * `setResult`. Companion to the FrameBuilder unit tests in
 * `tests/unit/FrameBuilder.test.ts` — those cover the middleware in isolation;
 * this file drives the full public pipeline so the spread clones in
 * `ReelSet._applyPinsToGrid`, `SpinController._coordinateBigSymbols`, and
 * `Reel.placeSymbols` are actually exercised.
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

/** Slot 0 of `reel.symbols` is the topmost buffer-above cell. */
function topBufferSymbol(reel: ReturnType<typeof makeHarness>['reelSet']['reels'][number]): string {
  return reel.symbols[0].symbolId;
}

function bottomBufferSymbol(reel: ReturnType<typeof makeHarness>['reelSet']['reels'][number]): string {
  return reel.symbols[reel.symbols.length - 1].symbolId;
}

describe('setResult — buffer-above (negative-index legacy form)', () => {
  it('places frame[col][-1] in the buffer-above slot via the full pipeline', async () => {
    const h = makeHarness();
    try {
      const target: string[][] = [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ];
      (target[1] as Record<number, string>)[-1] = 'coin';

      await h.spinAndLand(target);

      expect(topBufferSymbol(h.reelSet.reels[1])).toBe('coin');
      // Other reels still have random buffer-above (not 'coin')
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('places frame[col][visibleRows] in the buffer-below slot (regression)', async () => {
    const h = makeHarness();
    try {
      // visibleRows = 3, bufferBelow = 1 by default
      const target: string[][] = [
        ['a', 'b', 'c'],
        ['a', 'b', 'c', 'wild'], // wild → buffer-below slot
        ['a', 'b', 'c'],
      ];

      await h.spinAndLand(target);

      expect(bottomBufferSymbol(h.reelSet.reels[1])).toBe('wild');
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('survives the pin-overlay clone path', async () => {
    const h = makeHarness();
    try {
      // Pin on a different reel forces _applyPinsToGrid to run.
      h.reelSet.pin(0, 0, 'wild', { turns: 'permanent' });

      const target: string[][] = [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ];
      (target[2] as Record<number, string>)[-1] = 'coin';

      await h.spinAndLand(target);

      // The pin overlay still works
      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('wild');
      // AND the buffer-above target survived the clone
      expect(topBufferSymbol(h.reelSet.reels[2])).toBe('coin');
    } finally {
      h.destroy();
    }
  });

  it('survives the big-symbol coordinator clone path', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: [...SYMBOLS, 'big'],
      symbolData: {
        big: { size: { w: 2, h: 2 } },
      },
    });
    try {
      const target: string[][] = [
        ['big', 'b', 'c'], // 2x2 anchor at (0,0)
        ['a', 'b', 'c'],   // OCCUPIED column from the 2x2
        ['a', 'b', 'c'],
      ];
      (target[2] as Record<number, string>)[-1] = 'coin';

      await h.spinAndLand(target);

      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('big');
      // Buffer-above target survived the _coordinateBigSymbols clone
      expect(topBufferSymbol(h.reelSet.reels[2])).toBe('coin');
    } finally {
      h.destroy();
    }
  });
});

describe('setResult — explicit ColumnTarget[] form', () => {
  it('accepts { visible } as the equivalent of legacy string[]', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'] },
      ] as unknown as string[][]);

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
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
        { visible: ['a', 'b', 'c'] },
      ] as unknown as string[][]);

      expect(topBufferSymbol(h.reelSet.reels[1])).toBe('coin');
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('places bufferBelow[0] in the slot closest to the visible bottom row', async () => {
    const h = makeHarness();
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['wild'] },
        { visible: ['a', 'b', 'c'] },
      ] as unknown as string[][]);

      expect(bottomBufferSymbol(h.reelSet.reels[1])).toBe('wild');
    } finally {
      h.destroy();
    }
  });

  it('survives a structuredClone round-trip (the form that legacy negative-index cannot survive)', async () => {
    const h = makeHarness();
    try {
      const target = [
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
        { visible: ['a', 'b', 'c'] },
      ];
      const cloned = structuredClone(target);

      await h.spinAndLand(cloned as unknown as string[][]);

      expect(topBufferSymbol(h.reelSet.reels[1])).toBe('coin');
    } finally {
      h.destroy();
    }
  });
});
