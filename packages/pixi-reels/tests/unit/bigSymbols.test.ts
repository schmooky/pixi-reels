import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

describe('big symbols', () => {
  it('lands a 2x2 block, anchor row reports anchor id, OCCUPIED rows do too', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: 3,
      symbolIds: ['a', 'bonus'],
      symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
    });
    try {
      await spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['bonus', 'X', 'a'], // server places anchor; engine paints OCCUPIED
        ['Y', 'Z', 'a'],     // ignored — engine paints OCCUPIED
        ['a', 'a', 'a'],
      ]);
      // Same-reel resolution at the Reel level.
      const reel2 = reelSet.reels[2];
      expect(reel2.getVisibleSymbols()[0]).toBe('bonus'); // anchor
      expect(reel2.getVisibleSymbols()[1]).toBe('bonus'); // intra-reel OCCUPIED → anchor

      // Cross-reel resolution via the ReelSet API.
      const grid = reelSet.getVisibleGrid();
      expect(grid[2][0]).toBe('bonus');
      expect(grid[2][1]).toBe('bonus');
      expect(grid[3][0]).toBe('bonus'); // cross-reel OCCUPIED resolved
      expect(grid[3][1]).toBe('bonus');
      expect(grid[4][0]).toBe('a');
    } finally {
      destroy();
    }
  });

  it('getSymbolFootprint reports anchor + size for cells inside a 2x2 block', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: 3,
      symbolIds: ['a', 'bonus'],
      symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
    });
    try {
      await spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['bonus', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const fp = reelSet.getSymbolFootprint(2, 0);
      expect(fp).toEqual({ anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } });
      const fp2 = reelSet.getSymbolFootprint(3, 0);
      expect(fp2).toEqual({ anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } });
      const fp3 = reelSet.getSymbolFootprint(2, 1);
      expect(fp3).toEqual({ anchor: { col: 2, row: 0 }, size: { w: 2, h: 2 } });
      // Normal cell: 1×1 footprint at itself.
      const fp4 = reelSet.getSymbolFootprint(0, 0);
      expect(fp4).toEqual({ anchor: { col: 0, row: 0 }, size: { w: 1, h: 1 } });
    } finally {
      destroy();
    }
  });

  it('throws when block extends past the bottom of the strip', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      // total strip = bufferAbove(1) + visibleRows(3) + bufferBelow(1) = 5.
      // 1x6 block at row 0 needs rows 0..5 — last row (5) is one past
      // the strip end.
      symbolIds: ['a', 'giant'],
      symbolData: { giant: { weight: 0, size: { w: 1, h: 6 } } },
    });
    try {
      const promise = reelSet.spin();
      expect(() => {
        reelSet.setResult([
          ['giant', 'a', 'a'],
          ['a', 'a', 'a'],
          ['a', 'a', 'a'],
        ]);
      }).toThrow(/extends past the bottom of the strip/);
      reelSet.slamStop();
      await promise.catch(() => {});
    } finally {
      destroy();
    }
  });

  it('throws when block extends past last column', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['a', 'wide'],
      symbolData: { wide: { weight: 0, size: { w: 4, h: 1 } } },
    });
    try {
      const promise = reelSet.spin();
      expect(() => {
        reelSet.setResult([
          ['a', 'a', 'a'],
          ['a', 'a', 'a'],
          ['wide', 'a', 'a'],
        ]);
      }).toThrow(/exceeds reel count/);
      reelSet.slamStop();
      await promise.catch(() => {});
    } finally {
      destroy();
    }
  });

  it('rejects big-symbol registration on MultiWays slots at build()', () => {
    expect(() =>
      createTestReelSet({
        reels: 5,
        multiways: { minRows: 2, maxRows: 7, reelPixelHeight: 600 },
        symbolIds: ['a', 'bonus'],
        symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
      }),
    ).toThrow(/big symbol .* cannot be registered on a MultiWays slot/);
  });

  it('getBlockBounds returns the pixel rect for a 2x2 block from any cell', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 5,
      visibleRows: 3,
      symbolIds: ['a', 'bonus'],
      symbolData: { bonus: { weight: 0, size: { w: 2, h: 2 } } },
      symbolSize: { width: 100, height: 100 },
    });
    try {
      await spinAndLand([
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['bonus', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      // From the anchor cell.
      const r1 = reelSet.getBlockBounds(2, 0);
      expect(r1.width).toBe(200);
      expect(r1.height).toBe(200);
      // From a non-anchor cell — same rect.
      const r2 = reelSet.getBlockBounds(3, 1);
      expect(r2).toEqual(r1);
      // 1x1 cell — equivalent to getCellBounds.
      const r3 = reelSet.getBlockBounds(0, 0);
      expect(r3.width).toBe(100);
      expect(r3.height).toBe(100);
    } finally {
      destroy();
    }
  });

  it('rejects big symbols with non-zero weight (random fill cannot place blocks)', () => {
    expect(() =>
      createTestReelSet({
        reels: 3,
        visibleRows: 3,
        symbolIds: ['a', 'bonus'],
        symbolData: { bonus: { weight: 5, size: { w: 2, h: 2 } } },
      }),
    ).toThrow(/big symbol .* must have weight 0/);
  });

  // ─── Buffer-row anchors (partial visibility) ────────────────────────
  // A 1xH block can land with its anchor in bufferAbove (tail visible at
  // the top of the window) or with stubs spilling into bufferBelow (head
  // visible at the bottom). The coordinator scans the full strip range,
  // `_finalizeFrame` sizes anchors anywhere on the strip, and
  // `getVisibleSymbols` / `getSymbolFootprint` / `getBlockBounds` all
  // resolve consistently — including via a negative `anchor.row` for
  // buffer-above anchors.

  it('lands a 1x3 with anchor in bufferAbove — visible row 0 reads the anchor id', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 2,
      symbolIds: ['a', 'b', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 3 } } },
    });
    try {
      // ColumnTarget form. Anchor at bufferAbove[1] = row -2. Block
      // spans rows -2, -1, 0 — only the bottom cell shows in visible
      // row 0. The coordinator paints OCCUPIED at row -1 and row 0
      // automatically; the user's `visible[0]` is overwritten.
      await spinAndLand([
        { visible: ['a', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
      ]);

      // Visible row 0 resolves to the anchor via the negative-row
      // occupancy added by `_finalizeFrame`'s bufferAbove scan.
      const grid = reelSet.getVisibleGrid();
      expect(grid[0][0]).toBe('tall');
      expect(grid[0][1]).toBe('a');
      expect(grid[0][2]).toBe('a');
    } finally {
      destroy();
    }
  });

  it('lands a 1x2 with anchor in bufferAbove[0] — top two rows of the block are off-screen, bottom shows at row 0+1', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 1,
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 2 } } },
    });
    try {
      // Anchor at bufferAbove[0] = row -1. Block spans rows -1, 0.
      // Only row 0 is visible; row 1 and row 2 are the user's `a` fillers.
      await spinAndLand([
        { visible: ['x', 'a', 'a'], bufferAbove: ['tall'] },
      ]);
      const grid = reelSet.getVisibleGrid();
      expect(grid[0][0]).toBe('tall');
      expect(grid[0][1]).toBe('a');
      expect(grid[0][2]).toBe('a');
    } finally {
      destroy();
    }
  });

  it('lands a 1x2 with anchor at last visible row — stub spills into bufferBelow', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 1,
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 2 } } },
    });
    try {
      // Anchor at visible row 2 (last). Block spans rows 2, 3 — row 3
      // is bufferBelow[0]. Pre-feature this threw (`row + h > rows`);
      // now it's a legal partial-visibility placement.
      await spinAndLand([
        { visible: ['a', 'a', 'tall'] },
      ]);
      const grid = reelSet.getVisibleGrid();
      expect(grid[0]).toEqual(['a', 'a', 'tall']);
      // Footprint reports the anchor at its actual visible row.
      const fp = reelSet.getSymbolFootprint(0, 2);
      expect(fp.anchor.row).toBe(2);
      expect(fp.size).toEqual({ w: 1, h: 2 });
    } finally {
      destroy();
    }
  });

  it('getSymbolFootprint returns a NEGATIVE anchor.row for blocks anchored in bufferAbove', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 2,
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 3 } } },
    });
    try {
      // Anchor at bufferAbove[1] = row -2.
      await spinAndLand([
        { visible: ['a', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
      ]);
      const fp = reelSet.getSymbolFootprint(0, 0);
      expect(fp.anchor.row).toBe(-2);
      expect(fp.size).toEqual({ w: 1, h: 3 });
      // getBlockBounds handles the negative row — returns the full
      // block's pixel rect (the off-screen portion is clipped by mask).
      const r = reelSet.getBlockBounds(0, 0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.width).toBeGreaterThan(0);
    } finally {
      destroy();
    }
  });

  it('partial-visibility block + nudge = fully reveals the block', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 1,
      symbolIds: ['a', 'b', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 2 } } },
    });
    try {
      // 1x2 anchor at bufferAbove[0]: block spans rows -1 and 0.
      // Visible reads ['tall' (via occupancy), 'a', 'a'].
      await spinAndLand([
        { visible: ['x', 'a', 'a'], bufferAbove: ['tall'] },
      ]);
      expect(reelSet.getVisibleGrid()[0]).toEqual(['tall', 'a', 'a']);
      // Nudge down by 1 — the anchor slides into visible row 0, stub
      // moves to row 1. Block fully visible.
      const result = await reelSet.nudge(0, {
        distance: 1,
        direction: 'down',
        incoming: ['b'],
      });
      expect(result.symbols[0]).toBe('tall');
      expect(result.symbols[1]).toBe('tall');
      expect(result.symbols[2]).toBe('a');
    } finally {
      destroy();
    }
  });

  it('strip-spin landing: 1x2 block at last visible row + stub in bufferBelow lands cleanly', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      bufferSymbols: 1,
      symbolIds: ['a', 'b', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 2 } } },
    });
    try {
      // setResult goes through `_coordinateBigSymbols`, so a 1x2 anchor
      // at row 2 (stub spilling into bufferBelow) should be legal.
      await spinAndLand([
        ['a', 'a', 'tall'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ]);
      const grid = reelSet.getVisibleGrid();
      expect(grid[0]).toEqual(['a', 'a', 'tall']);
      // And the anchor's footprint reports correctly.
      const fp = reelSet.getSymbolFootprint(0, 2);
      expect(fp.anchor).toEqual({ col: 0, row: 2 });
      expect(fp.size).toEqual({ w: 1, h: 2 });
    } finally {
      destroy();
    }
  });

  it('throws if the buffer-anchored block extends past the bottom of the strip', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 1,
      // total = 5. 1x4 anchor at row -1 needs rows -1..2 (4 cells) → fits.
      // 1x4 anchor at row 1 needs rows 1..4 → fits exactly (1+4 = 5 = visible+below).
      // 1x4 anchor at row 2 needs rows 2..5 → 5 > 4 → throws.
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 4 } } },
    });
    try {
      const promise = reelSet.spin();
      expect(() => {
        reelSet.setResult([
          { visible: ['a', 'a', 'tall'] }, // anchor at row 2, h=4 → past strip
        ]);
      }).toThrow(/extends past the bottom of the strip/);
      reelSet.slamStop();
      await promise.catch(() => {});
    } finally {
      destroy();
    }
  });
});
