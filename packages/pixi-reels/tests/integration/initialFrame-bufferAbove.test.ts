/**
 * End-to-end tests for `ReelSetBuilder.initialFrame` buffer-aware seeding
 * via the `ColumnTarget[]` form.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'coin'];

describe('initialFrame buffer placement', () => {
  it('bufferAbove[0] populates buffer-above slot 0', () => {
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
      expect(h.reelSet.reels[0].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('survives structuredClone', () => {
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
      const reel = h.reelSet.reels[1];
      expect(reel.symbols[reel.symbols.length - 1].symbolId).toBe('coin');
    } finally {
      h.destroy();
    }
  });
});
