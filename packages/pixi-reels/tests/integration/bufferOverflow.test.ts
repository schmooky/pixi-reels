/**
 * Buffer-overflow fail-fast tests for the two public entry points that
 * accept `ColumnTarget[]` grids: `ReelSet.setResult` and
 * `ReelSetBuilder.initialFrame`.
 *
 * The bug being defended against: extra `bufferAbove` / `bufferBelow`
 * entries (more than the engine's configured `bufferSymbols`) used to be
 * written into the materialized array but silently dropped by the next
 * clone. No error, no warning, target never lands. The assertion is now
 * at the entry point so the caller sees the misuse immediately.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { Ticker } from 'pixi.js';

const SYMBOLS = ['a', 'b', 'c', 'X', 'Y'];

describe('setResult buffer overflow throws', () => {
  it('throws when ColumnTarget.bufferAbove has more entries than bufferSymbols', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 1 });
    try {
      expect(() =>
        h.reelSet.setResult([
          { visible: ['a', 'b', 'c'] },
          { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
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
          { visible: ['a', 'b', 'c'], bufferBelow: ['X', 'Y'] },
          { visible: ['a', 'b', 'c'] },
        ]),
      ).toThrowError(/setResult column 1: bufferBelow has 2 entries but engine bufferSymbols=1/);
    } finally {
      h.destroy();
    }
  });

  it('accepts ColumnTarget within bounds (regression: the assertion is non-disruptive)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS, bufferSymbols: 1 });
    try {
      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X'] },
        { visible: ['a', 'b', 'c'], bufferBelow: ['Y'] },
      ]);
      h.reelSet.slamStop();
      await spin;
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
      const spin = h.reelSet.spin();
      h.reelSet.setResult([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
        { visible: ['a', 'b', 'c'] },
      ]);
      h.reelSet.slamStop();
      await spin;
      // bufferAbove=2: bufferAbove[0]='X' closest to visible -> reel.symbols[1];
      // bufferAbove[1]='Y' furthest above -> reel.symbols[0].
      expect(h.reelSet.reels[1].symbols[0].symbolId).toBe('Y');
      expect(h.reelSet.reels[1].symbols[1].symbolId).toBe('X');
    } finally {
      h.destroy();
    }
  });
});

describe('initialFrame buffer overflow throws', () => {
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
        { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
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
        { visible: ['a', 'b', 'c'], bufferBelow: ['X', 'Y'] },
        { visible: ['a', 'b', 'c'] },
      ]);
    expect(() => builder.build()).toThrowError(
      /initialFrame column 1: bufferBelow has 2 entries but engine bufferSymbols=1/,
    );
  });

  it('order of builder calls does not matter, overflow throws regardless', () => {
    // initialFrame() called BEFORE bufferSymbols(). Materialization is
    // deferred to build() so configuration is final by the time we check.
    const builder = makeBuilder()
      .initialFrame([
        { visible: ['a', 'b', 'c'] },
        { visible: ['a', 'b', 'c'], bufferAbove: ['X', 'Y'] },
        { visible: ['a', 'b', 'c'] },
      ])
      .bufferSymbols(1);
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
