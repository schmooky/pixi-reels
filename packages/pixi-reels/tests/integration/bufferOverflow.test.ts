/**
 * Buffer-overflow fail-fast tests for the two public entry points that
 * accept `ColumnTarget[]` / legacy `string[][]` grids: `ReelSet.setResult`
 * and `ReelSetBuilder.initialFrame`.
 *
 * The bug being defended against: extra `bufferAbove` / `bufferBelow`
 * entries (more than the engine's configured `bufferSymbols`) used to be
 * written into the materialized array but silently dropped by the next
 * clone — no error, no warning, target never lands. The assertion is now
 * at the entry point so the caller sees the misuse immediately.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

const SYMBOLS = ['a', 'b', 'c', 'X', 'Y'];

describe('setResult — buffer overflow throws', () => {
  it('throws when ColumnTarget.bufferAbove has more entries than bufferSymbols', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 1 });
    try {
      expect(() =>
        h.reelSet.setResult([
          { visible: ['a', 'b', 'c'] },
          { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] }, // 2 > 1
          { visible: ['a', 'b', 'c'] },
        ]),
      ).toThrowError(/setResult column 1: bufferAbove has 2 entries but engine bufferSymbols=1/);
    } finally {
      h.destroy();
    }
  });

  it('throws when ColumnTarget.bufferBelow has more entries than bufferSymbols', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 1 });
    try {
      expect(() =>
        h.reelSet.setResult([
          { visible: ['a', 'b', 'c'] },
          { visible: ['a', 'b', 'c'], bufferBelow: ['X', 'Y'] }, // 2 > 1
          { visible: ['a', 'b', 'c'] },
        ]),
      ).toThrowError(/setResult column 1: bufferBelow has 2 entries but engine bufferSymbols=1/);
    } finally {
      h.destroy();
    }
  });

  it('throws for legacy form negative-index keys beyond bufferAbove', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 1 });
    try {
      const col: string[] = ['a', 'b', 'c'];
      (col as Record<number, string>)[-1] = 'X';
      (col as Record<number, string>)[-2] = 'Y'; // out of range
      expect(() =>
        h.reelSet.setResult([['a', 'b', 'c'], col, ['a', 'b', 'c']]),
      ).toThrowError(/setResult column 1: frame\[1\]\[-2\] is set but engine bufferSymbols=1/);
    } finally {
      h.destroy();
    }
  });

  it('accepts ColumnTarget within bounds (regression — assertion is non-disruptive)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 1 });
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['Y'] },
      ] as unknown as string[][]);
      expect(h.reelSet.reels[1].symbols[0].symbolId).toBe('X');
      expect(
        h.reelSet.reels[2].symbols[h.reelSet.reels[2].symbols.length - 1].symbolId,
      ).toBe('Y');
    } finally {
      h.destroy();
    }
  });

  it('accepts bufferSymbols(2) when the caller supplies two entries', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 2 });
    try {
      await h.spinAndLand([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
        { visible: ['a', 'b', 'c'] },
      ] as unknown as string[][]);
      // bufferAbove=2: bufferAbove[0]='X' closest to visible → arr[-1] → reel.symbols[1];
      // bufferAbove[1]='Y' furthest above → arr[-2] → reel.symbols[0].
      expect(h.reelSet.reels[1].symbols[0].symbolId).toBe('Y');
      expect(h.reelSet.reels[1].symbols[1].symbolId).toBe('X');
    } finally {
      h.destroy();
    }
  });
});

describe('initialFrame — buffer overflow throws', () => {
  function makeBuilder() {
    return new ReelSetBuilder()
      .reels(3)
      .visibleRows(3)
      .symbolSize(100, 100)
      .ticker(new FakeTicker() as unknown as Ticker)
      .symbols((r) => {
        for (const id of SYMBOLS) r.register(id, HeadlessSymbol, {});
      });
  }

  it('throws on build() when ColumnTarget.bufferAbove exceeds bufferSymbols', () => {
    const builder = makeBuilder()
      .bufferSymbols(1)
      .initialFrame([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] }, // 2 > 1
        { visible: ['a', 'b', 'c'] },
      ]);
    expect(() => builder.build()).toThrowError(
      /initialFrame column 1: bufferAbove has 2 entries but engine bufferSymbols=1/,
    );
  });

  it('throws on build() when ColumnTarget.bufferBelow exceeds bufferSymbols', () => {
    const builder = makeBuilder()
      .bufferSymbols(1)
      .initialFrame([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['X', 'Y'] }, // 2 > 1
        { visible: ['a', 'b', 'c'] },
      ]);
    expect(() => builder.build()).toThrowError(
      /initialFrame column 1: bufferBelow has 2 entries but engine bufferSymbols=1/,
    );
  });

  it('throws on build() for legacy form negative-index keys beyond bufferAbove', () => {
    const col: string[] = ['a', 'b', 'c'];
    (col as Record<number, string>)[-1] = 'X';
    (col as Record<number, string>)[-2] = 'Y';
    const builder = makeBuilder()
      .bufferSymbols(1)
      .initialFrame([['a', 'b', 'c'], col, ['a', 'b', 'c']]);
    expect(() => builder.build()).toThrowError(
      /initialFrame column 1: frame\[1\]\[-2\] is set but engine bufferSymbols=1/,
    );
  });

  it('order of builder calls does not matter — overflow throws regardless', () => {
    // initialFrame() called BEFORE bufferSymbols(). The previous behavior
    // was to materialize immediately with whatever defaults were set; the
    // current behavior defers materialization to build() so configuration
    // is final by the time we check.
    const builder = makeBuilder()
      .initialFrame([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] }, // 2 entries
        { visible: ['a', 'b', 'c'] },
      ])
      .bufferSymbols(1); // set AFTER initialFrame; 2 > 1 still throws
    expect(() => builder.build()).toThrowError(/bufferAbove has 2 entries/);
  });

  it('accepts initialFrame within bounds (regression)', () => {
    const builder = makeBuilder()
      .bufferSymbols(1)
      .initialFrame([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['Y'] },
      ]);
    const reelSet = builder.build();
    try {
      expect(reelSet.reels[1].symbols[0].symbolId).toBe('X');
      expect(reelSet.reels[2].symbols[reelSet.reels[2].symbols.length - 1].symbolId).toBe('Y');
    } finally {
      reelSet.destroy();
    }
  });
});

// ─── MultiWays compatibility regression ──────────────────────────────────
//
// MultiWays varies visible row counts per spin: `setShape([5,2,6])` records
// the target shape, then `setResult` passes a grid sized to that target,
// then AdjustPhase reshapes the reels DURING the spin. At the moment
// `setResult` runs the validator, `reel.visibleRows` still holds the
// PREVIOUS spin's shape — so a check that compared `grid[i].length` to
// `visibleRows + bufferBelow` would fire false positives on every
// legitimate MultiWays spin that resizes.
//
// The validator's design decision is to OMIT the length-based bufferBelow
// check for the legacy `string[]` form (using the explicit form is the
// recommended path for full overflow protection). This test pins that
// decision so a future contributor can't silently reintroduce the check
// without breaking MultiWays.
describe('setResult — MultiWays compatibility', () => {
  it('does NOT throw when legacy-form column length > current visibleRows (MultiWays reshape pending)', async () => {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .multiways({ minRows: 2, maxRows: 6, reelPixelHeight: 600 })
      .symbolSize(100, 100)
      .tumble()
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => {
        for (const id of SYMBOLS) r.register(id, HeadlessSymbol, {});
      })
      .build();

    try {
      // Spin 1: shape [3,4,2] — reels resize from default (maxRows=6) to
      // these values during AdjustPhase.
      let promise = reelSet.spin({ mode: 'cascade' });
      reelSet.setShape([3, 4, 2]);
      reelSet.setResult([
        ['a', 'b', 'c'],
        ['a', 'b', 'c', 'a'],
        ['a', 'b'],
      ]);
      reelSet.slamStop();
      await promise;
      expect(reelSet.reels.map((r) => r.visibleRows)).toEqual([3, 4, 2]);

      // Spin 2: shape [5,2,6]. At setResult time, reels are still at
      // [3,4,2] from spin 1 — `reel.visibleRows[0]` = 3, but the caller
      // legitimately passes a length-5 column. The validator must NOT
      // throw here (this was the v1 regression).
      promise = reelSet.spin({ mode: 'cascade' });
      reelSet.setShape([5, 2, 6]);
      expect(() => {
        reelSet.setResult([
          ['a', 'b', 'c', 'a', 'b'],
          ['a', 'b'],
          ['a', 'b', 'c', 'a', 'b', 'c'],
        ]);
      }).not.toThrow();
      reelSet.slamStop();
      await promise;
      expect(reelSet.reels.map((r) => r.visibleRows)).toEqual([5, 2, 6]);
    } finally {
      reelSet.destroy();
      ticker.destroy();
    }
  });

  it('still throws on legacy-form NEGATIVE-index overflow during MultiWays — bufferAbove is stable across reshape', async () => {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(3)
      .multiways({ minRows: 2, maxRows: 6, reelPixelHeight: 600 })
      .bufferSymbols(1)
      .symbolSize(100, 100)
      .tumble()
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => {
        for (const id of SYMBOLS) r.register(id, HeadlessSymbol, {});
      })
      .build();

    try {
      reelSet.spin({ mode: 'cascade' }).catch(() => {});
      reelSet.setShape([3, 3, 3]);

      const col: string[] = ['a', 'b', 'c'];
      (col as Record<number, string>)[-1] = 'X';
      (col as Record<number, string>)[-2] = 'Y'; // overflow

      expect(() => {
        reelSet.setResult([['a', 'b', 'c'], col, ['a', 'b', 'c']]);
      }).toThrowError(/setResult column 1: frame\[1\]\[-2\] is set but engine bufferSymbols=1/);

      reelSet.slamStop();
    } finally {
      reelSet.destroy();
      ticker.destroy();
    }
  });
});
