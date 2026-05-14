/**
 * End-to-end tests for `ReelSetBuilder.initialFrame` buffer-aware seeding.
 * Mirrors `setResult-bufferAbove.test.ts` for the build-time path: both the
 * legacy `string[][]` form (with negative-index buffer-above slots) and the
 * explicit `ColumnTarget[]` form are exercised.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'coin'];

describe('initialFrame — buffer-above', () => {
  it('legacy string[][] form: frame[col][-1] populates buffer-above slot 0', () => {
    const frame: string[][] = [
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ];
    (frame[1] as Record<number, string>)[-1] = 'coin';

    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
      bufferSymbols: 1,
      initialFrame: frame,
    });
    try {
      expect(h.reelSet.reels[1].symbols[0].symbolId).toBe('coin');
      // Visible area still as specified
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
      // Other reels unaffected
      expect(h.reelSet.reels[0].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('explicit ColumnTarget[] form: bufferAbove[0] populates buffer-above slot 0', () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
      bufferSymbols: 1,
      initialFrame: [
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
        { visible: ['a', 'b', 'c'] },
      ],
    });
    try {
      expect(h.reelSet.reels[1].symbols[0].symbolId).toBe('coin');
      expect(h.reelSet.reels[1].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('explicit form survives structuredClone (legacy form does not)', () => {
    const seed = [
      { visible: ['a', 'b', 'c'], bufferAbove: ['coin'] },
      { visible: ['a', 'b', 'c'] },
      { visible: ['a', 'b', 'c'] },
    ];
    const cloned = structuredClone(seed);

    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
      bufferSymbols: 1,
      initialFrame: cloned,
    });
    try {
      expect(h.reelSet.reels[0].symbols[0].symbolId).toBe('coin');
    } finally {
      h.destroy();
    }
  });

  it('bufferBelow[0] populates the slot just below the visible area', () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: SYMBOLS,
      bufferSymbols: 1,
      initialFrame: [
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['coin'] },
        { visible: ['a', 'b', 'c'] },
      ],
    });
    try {
      // With bufferSymbols=1 + visibleRows=3, total slots = 5: [above, v0, v1, v2, below].
      const reel = h.reelSet.reels[1];
      expect(reel.symbols[reel.symbols.length - 1].symbolId).toBe('coin');
    } finally {
      h.destroy();
    }
  });
});
