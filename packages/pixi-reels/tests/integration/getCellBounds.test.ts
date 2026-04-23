/**
 * getCellBounds — coordinate utility tests.
 *
 * The method is pure-geometric: it derives bounds from the reel's stored
 * position and ReelMotion.slotHeight. No ticker needed, no spin needed —
 * just assert the math.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

describe('getCellBounds — default gap (0)', () => {
  it('returns the top-left cell at origin', () => {
    const h = createTestReelSet({
      reels: 5, visibleRows: 3,
      symbolIds: ['a'],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      expect(h.reelSet.getCellBounds(0, 0)).toEqual({
        x: 0, y: 0, width: 100, height: 100,
      });
    } finally {
      h.destroy();
    }
  });

  it('spaces columns by symbolWidth with zero gap', () => {
    const h = createTestReelSet({
      reels: 5, visibleRows: 3,
      symbolIds: ['a'],
      symbolSize: { width: 120, height: 80 },
    });
    try {
      expect(h.reelSet.getCellBounds(2, 0).x).toBe(240);
      expect(h.reelSet.getCellBounds(4, 0).x).toBe(480);
    } finally {
      h.destroy();
    }
  });

  it('stacks rows by symbolHeight with zero gap', () => {
    const h = createTestReelSet({
      reels: 5, visibleRows: 3,
      symbolIds: ['a'],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      expect(h.reelSet.getCellBounds(0, 1).y).toBe(100);
      expect(h.reelSet.getCellBounds(0, 2).y).toBe(200);
    } finally {
      h.destroy();
    }
  });
});

describe('getCellBounds — non-zero gap', () => {
  it('adds gapX between columns', () => {
    const h = createTestReelSet({
      reels: 5, visibleRows: 3,
      symbolIds: ['a'],
      symbolSize: { width: 100, height: 100 },
      symbolGap: { x: 10, y: 0 },
    });
    try {
      expect(h.reelSet.getCellBounds(0, 0).x).toBe(0);
      expect(h.reelSet.getCellBounds(1, 0).x).toBe(110);
      expect(h.reelSet.getCellBounds(4, 0).x).toBe(440);
    } finally {
      h.destroy();
    }
  });

  it('adds gapY between rows', () => {
    const h = createTestReelSet({
      reels: 5, visibleRows: 3,
      symbolIds: ['a'],
      symbolSize: { width: 100, height: 100 },
      symbolGap: { x: 0, y: 8 },
    });
    try {
      expect(h.reelSet.getCellBounds(0, 0).y).toBe(0);
      expect(h.reelSet.getCellBounds(0, 1).y).toBe(108);
      expect(h.reelSet.getCellBounds(0, 2).y).toBe(216);
    } finally {
      h.destroy();
    }
  });
});

describe('getCellBounds — non-square symbols', () => {
  it('returns the correct width/height for rectangular cells', () => {
    const h = createTestReelSet({
      reels: 4, visibleRows: 2,
      symbolIds: ['a'],
      symbolSize: { width: 160, height: 90 },
    });
    try {
      const b = h.reelSet.getCellBounds(2, 1);
      expect(b.width).toBe(160);
      expect(b.height).toBe(90);
      expect(b.x).toBe(320);
      expect(b.y).toBe(90);
    } finally {
      h.destroy();
    }
  });
});

describe('getCellBounds — errors', () => {
  it('throws when col is negative', () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a'] });
    try {
      expect(() => h.reelSet.getCellBounds(-1, 0)).toThrow(RangeError);
    } finally {
      h.destroy();
    }
  });

  it('throws when col is out of range', () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a'] });
    try {
      expect(() => h.reelSet.getCellBounds(5, 0)).toThrow(/col 5 out of range/);
    } finally {
      h.destroy();
    }
  });

  it('throws when row is negative', () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a'] });
    try {
      expect(() => h.reelSet.getCellBounds(0, -1)).toThrow(RangeError);
    } finally {
      h.destroy();
    }
  });

  it('throws when row is out of range', () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a'] });
    try {
      expect(() => h.reelSet.getCellBounds(0, 3)).toThrow(/row 3 out of range/);
    } finally {
      h.destroy();
    }
  });
});

describe('getCellBounds — relationship to payline drawing', () => {
  it('centre of a cell equals x + width/2, y + height/2', () => {
    const h = createTestReelSet({
      reels: 5, visibleRows: 3,
      symbolIds: ['a'],
      symbolSize: { width: 90, height: 90 },
      symbolGap: { x: 4, y: 4 },
    });
    try {
      // Middle of cell (2, 1) — a common payline anchor.
      const b = h.reelSet.getCellBounds(2, 1);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      // Column 2 @ gap 4: x = 2 * (90 + 4) = 188; centre = 188 + 45 = 233.
      expect(cx).toBe(233);
      // Row 1 @ gap 4: y = 1 * (90 + 4) = 94; centre = 94 + 45 = 139.
      expect(cy).toBe(139);
    } finally {
      h.destroy();
    }
  });

  it('returns fresh objects (safe to mutate)', () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a'] });
    try {
      const a = h.reelSet.getCellBounds(2, 1);
      const b = h.reelSet.getCellBounds(2, 1);
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    } finally {
      h.destroy();
    }
  });
});
