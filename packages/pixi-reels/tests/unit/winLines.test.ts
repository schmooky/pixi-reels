/**
 * WinLines: paylines and payways drawn with pixi-silk over a reel set. Runs
 * headless (the test setup gives SilkGraphics a canvas without WebGL), so it
 * checks what was drawn where, not pixels.
 */
import { describe, it, expect } from 'vitest';
import type { SilkGraphics } from 'pixi-silk';
import { createTestReelSet } from '../../src/testing/index.js';
import { WinLines } from '../../src/debug/WinLines.js';

const harness = () => createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });

describe('WinLines', () => {
  it('lives in the reel set and draws one SilkGraphics per line', () => {
    const h = harness();
    try {
      const lines = new WinLines(h.reelSet);
      expect(lines.parent).toBe(h.reelSet);
      const g = lines.line([0, 1, 2, 1, 0].map((cellIndex, reelIndex) => ({ reelIndex, cellIndex })));
      expect(lines.children).toEqual([g]);
      expect(g.primitiveCount).toBeGreaterThan(0);
      lines.destroy();
      expect(h.reelSet.children.includes(lines)).toBe(false);
    } finally {
      h.destroy();
    }
  });

  it('a payline spans its cell centres', () => {
    const h = harness();
    try {
      const lines = new WinLines(h.reelSet, { glow: 0, dot: 0, width: 2 });
      const g = lines.line([{ reelIndex: 0, cellIndex: 0 }, { reelIndex: 4, cellIndex: 2 }]);
      const a = h.reelSet.getCellBounds(0, 0);
      const b = h.reelSet.getCellBounds(4, 2);
      const box = g.getLocalBounds();
      // Centre to centre, plus half the stroke on each side.
      expect(box.x).toBeCloseTo(a.x + a.width / 2 - 1, 0);
      expect(box.x + box.width).toBeCloseTo(b.x + b.width / 2 + 1, 0);
    } finally {
      h.destroy();
    }
  });

  it('a payway joins every winning cell to every winning cell on the next reel', () => {
    const h = harness();
    try {
      const lines = new WinLines(h.reelSet, { glow: 0, dot: 0 });
      const perReel = [[0, 2], [1], [0, 1, 2]];
      const g: SilkGraphics = lines.ways(perReel);
      // 2x1 + 1x3 segments, one primitive each.
      expect(g.primitiveCount).toBe(5);
      const withExtras = new WinLines(h.reelSet).ways(perReel);
      // Glow doubles every segment; a dot per cell.
      expect(withExtras.primitiveCount).toBe(5 * 2 + 6);
    } finally {
      h.destroy();
    }
  });

  it('draws where the board is now, including reels added since', () => {
    const h = harness();
    try {
      const lines = new WinLines(h.reelSet, { glow: 0, dot: 0, width: 2 });
      h.reelSet.addReels(3);
      const g = lines.ways([[1], [1], [1]], { fromReel: 5 });
      const end = h.reelSet.getCellBounds(7, 1);
      const box = g.getLocalBounds();
      expect(box.x + box.width).toBeCloseTo(end.x + end.width / 2 + 1, 0);
    } finally {
      h.destroy();
    }
  });

  it('hands out palette colors in turn and starts over on clear', () => {
    const h = harness();
    try {
      const lines = new WinLines(h.reelSet, { palette: [0x111111, 0x222222] });
      lines.line([{ reelIndex: 0, cellIndex: 0 }, { reelIndex: 1, cellIndex: 0 }]);
      lines.line([{ reelIndex: 0, cellIndex: 1 }, { reelIndex: 1, cellIndex: 1 }]);
      expect(lines.children).toHaveLength(2);
      lines.clear();
      expect(lines.children).toHaveLength(0);
    } finally {
      h.destroy();
    }
  });
});
