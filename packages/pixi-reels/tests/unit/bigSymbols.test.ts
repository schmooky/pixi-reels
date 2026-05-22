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

  // ReelMotion wrap thresholds depended on the assumption bufferBelow === 1
  // — `_maxY` was hard-coded to `(visibleRows + 1) * slotH`, which collapses
  // to `strip[last].y` exactly for bufferBelow=2 and triggers a phantom wrap
  // on the first displace tick. With the fix, maxY scales with bufferBelow
  // and nudge counts wraps exactly `distance` times.
  //
  // We assert the EXACT strip layout (anchor at strip[2], stubs at strip[3..4])
  // and not just visibleSymbols. Pre-fix the visible symbols read
  // `['?', 'tall', 'tall']` because the block landed at strip[3..5] with the
  // tail spilling into bufferBelow — exactly the "tail in lower buffer"
  // regression. Asserting strip-by-index catches that even if a future bug
  // happens to also produce the right `visibleSymbols` accidentally.
  it('nudge DOWN preserves block position when bufferBelow >= 2 (pre-fix: off-by-one)', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 2, // bufferAbove=2 AND bufferBelow=2 — total strip = 7.
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 3 } } },
    });
    try {
      // 1x3 anchor at bufferAbove[1] = row -2 → block at rows -2, -1, 0.
      // Tail visible: visible[0] = stub→'tall', visible[1..2] = 'a'.
      await spinAndLand([
        { visible: ['a', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
      ]);
      expect(reelSet.getVisibleGrid()[0]).toEqual(['tall', 'a', 'a']);

      const reel = reelSet.reels[0];
      const OCC = '__pixi_reels_occupied__';

      // Pre-nudge: anchor at strip[0], stubs at strip[1..2].
      const preStrip = reel.symbols.map((s) => s.symbolId);
      expect(preStrip[0]).toBe('tall');
      expect(preStrip[1]).toBe(OCC);
      expect(preStrip[2]).toBe(OCC);

      // DOWN by 2: anchor moves from strip[0] (row -2) to strip[2] (row 0).
      // Block fills all three visible rows. Pre-fix this landed at strip[3]
      // because the wrap fired one tick too early — the tail slipped into
      // bufferBelow and only the top 2/3 of the block stayed visible.
      const result = await reelSet.nudge(0, {
        distance: 2,
        direction: 'down',
        incoming: ['a', 'a'],
      });
      expect(result.symbols).toEqual(['tall', 'tall', 'tall']);

      const postStrip = reel.symbols.map((s) => s.symbolId);
      expect(postStrip[2]).toBe('tall'); // anchor at row 0
      expect(postStrip[3]).toBe(OCC);
      expect(postStrip[4]).toBe(OCC);
      // Bufferbelow must NOT carry any block cell — that was the
      // regression: tail ended up at strip[5] (= bufferBelow[0]).
      expect(postStrip[5]).not.toBe(OCC);
      expect(postStrip[5]).not.toBe('tall');

      // UP by 2 returns to tail-visible.
      const result2 = await reelSet.nudge(0, {
        distance: 2,
        direction: 'up',
        incoming: ['a', 'a'],
      });
      expect(result2.symbols).toEqual(['tall', 'a', 'a']);

      const finalStrip = reel.symbols.map((s) => s.symbolId);
      expect(finalStrip[0]).toBe('tall');
      expect(finalStrip[1]).toBe(OCC);
      expect(finalStrip[2]).toBe(OCC);
    } finally {
      destroy();
    }
  });

  // The user-reported regression: when the recipe runs DOWN only (no UP),
  // pre-fix the block ended in a head-visible state with the tail in
  // bufferBelow. Post-fix the block ends in fully-visible state (anchor at
  // row 0). This test mirrors that exact scenario verbatim.
  it('DOWN-only nudge from tail-visible lands the block fully visible, not head-visible', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 2,
      symbolIds: ['a', 'tall'],
      symbolData: { tall: { weight: 0, size: { w: 1, h: 3 } } },
    });
    try {
      await spinAndLand([
        { visible: ['a', 'a', 'a'], bufferAbove: [undefined, 'tall'] },
      ]);

      const result = await reelSet.nudge(0, {
        distance: 2,
        direction: 'down',
        incoming: ['a', 'a'],
      });

      // All three visible rows show the block.
      expect(result.symbols).toEqual(['tall', 'tall', 'tall']);

      // And specifically the block did NOT land in head-visible with the
      // tail spilling into bufferBelow. Strip layout:
      //   bufferAbove(2) | visible(3) | bufferBelow(2)
      //   [0..1]         | [2..4]     | [5..6]
      // Correct: anchor strip[2], stubs strip[3..4].
      // Regression: anchor strip[3], stubs strip[4..5] (stub at bufferBelow[0]).
      const OCC = '__pixi_reels_occupied__';
      const ids = reelSet.reels[0].symbols.map((s) => s.symbolId);
      expect(ids[2]).toBe('tall');
      expect(ids[5]).not.toBe(OCC);
    } finally {
      destroy();
    }
  });

  // Cross-reel buffer-above anchor: a 2x2 block whose anchor sits at
  // bufferAbove[0] on the left reel. The block covers col 0 rows -1, 0 and
  // col 1 rows -1, 0. On col 1, the visible[0] OccupiedStub must resolve
  // back to the anchor on col 0 via the cross-reel resolver, even though
  // the anchor lives at a NEGATIVE row.
  //
  // This exercises three branches together that no other test hits:
  //   - `_coordinateBigSymbols` painting OCCUPIED at `(col=1, row=-1)`
  //     AND `(col=1, row=0)` for a w>1 block anchored above visible.
  //   - The cross-reel resolver's `symbols[bufferAbove + anchor.row]`
  //     read with a negative `anchor.row`.
  //   - `getSymbolFootprint` walking left from a cross-reel OCCUPIED cell
  //     whose own `_getAnchorRow` returns the visible row (no per-reel
  //     occupancy on col 1 because Scan 2 only sees its own anchor) and
  //     finding the leftward big-symbol owner that covers it.
  it('cross-reel 2x2 with anchor in bufferAbove — resolves visible cells and footprint correctly', async () => {
    const { reelSet, spinAndLand, destroy } = createTestReelSet({
      reels: 2,
      visibleRows: 3,
      bufferSymbols: 2,
      symbolIds: ['a', 'big'],
      symbolData: { big: { weight: 0, size: { w: 2, h: 2 } } },
    });
    try {
      // Anchor at (col=0, bufferAbove[0]) = (col=0, row=-1). Block covers
      // (0,-1)(anchor), (1,-1)(stub), (0,0)(stub), (1,0)(stub).
      // Visible: row 0 across both cols shows the bottom of the block;
      // rows 1, 2 are random fillers.
      await spinAndLand([
        { visible: ['a', 'a', 'a'], bufferAbove: ['big'] },
        { visible: ['a', 'a', 'a'] },
      ]);

      // Visible row 0 on BOTH columns resolves to 'big':
      //   - col 0: via local `_occupancy[0].anchorRow = -1` (Scan 2)
      //   - col 1: via the cross-reel resolver walking left to col 0
      const grid = reelSet.getVisibleGrid();
      expect(grid[0][0]).toBe('big');
      expect(grid[1][0]).toBe('big');
      expect(grid[0][1]).toBe('a');
      expect(grid[1][1]).toBe('a');

      // Footprint from EITHER cell of the visible bottom row of the block
      // points back to the same anchor at (0, -1).
      const fpLeft = reelSet.getSymbolFootprint(0, 0);
      expect(fpLeft.anchor).toEqual({ col: 0, row: -1 });
      expect(fpLeft.size).toEqual({ w: 2, h: 2 });

      const fpRight = reelSet.getSymbolFootprint(1, 0);
      expect(fpRight.anchor).toEqual({ col: 0, row: -1 });
      expect(fpRight.size).toEqual({ w: 2, h: 2 });

      // Block bounds span both reels and reach above visible row 0.
      const r = reelSet.getBlockBounds(1, 0);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      // 1x1 cell bounds for comparison: block height must be ~2x.
      const cell = reelSet.getCellBounds(0, 1);
      expect(r.height).toBeGreaterThan(cell.height);
      expect(r.width).toBeGreaterThan(cell.width);
    } finally {
      destroy();
    }
  });

  it('throws if the buffer-anchored block extends past the bottom of the strip', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 1,
      visibleRows: 3,
      bufferSymbols: 1,
      // Strip layout: bufferAbove(1) | visible(3) | bufferBelow(1) — 5 cells.
      // The check is `anchor.row + h > visibleRows + bufferBelow`, i.e.
      // `row + 4 > 4`. So legal anchor rows for h=4 are {-1, 0}:
      //   row=-1 → -1+4 = 3 → 3 > 4 ? no → fits (cells -1..2).
      //   row= 0 →  0+4 = 4 → 4 > 4 ? no → fits exactly (cells 0..3,
      //                                          last cell in bufferBelow).
      //   row= 1 →  1+4 = 5 → 5 > 4 ? yes → throws.
      //   row= 2 →  2+4 = 6 → 6 > 4 ? yes → throws (what this test uses).
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
