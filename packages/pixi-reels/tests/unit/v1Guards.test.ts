/**
 * ADR 016 section 10.8: no silent deprecated aliases. Every v1 name either
 * fails to compile or throws a message that names the v2 name and the
 * codemod. These tests drive the JS-consumer path (v1 shapes cast through
 * `as never`), which is the one TypeScript cannot catch.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';

const CODEMOD = /npx pixi-reels-codemod v1-to-v2/;

describe('removed builder methods throw by name', () => {
  it.each([
    ['visibleRows', 'visibleCells'],
    ['visibleRowsPerReel', 'visibleCellsPerReel'],
    ['reelPixelHeights', 'reelExtents'],
  ])('%s -> %s', (v1, v2) => {
    const b = new ReelSetBuilder() as unknown as Record<string, (x: unknown) => unknown>;
    expect(() => b[v1](3)).toThrowError(new RegExp(`'${v1}' was renamed to '${v2}'`));
    expect(() => b[v1](3)).toThrowError(CODEMOD);
  });
});

describe('v1 option keys throw by name', () => {
  it('bufferSymbols({ above, below })', () => {
    expect(() => new ReelSetBuilder().bufferSymbols({ above: 1, below: 0 } as never)).toThrowError(
      /bufferSymbols\(\): 'above' was renamed to 'start'/,
    );
  });

  it('multiways({ minRows })', () => {
    expect(() =>
      new ReelSetBuilder().multiways({ minRows: 2, maxRows: 5, reelExtent: 600 } as never),
    ).toThrowError(/multiways\(\): 'minRows' was renamed to 'minCells'/);
  });

  it('multiways({ reelPixelHeight })', () => {
    expect(() =>
      new ReelSetBuilder().multiways({ minCells: 2, maxCells: 5, reelPixelHeight: 600 } as never),
    ).toThrowError(/'reelPixelHeight' was renamed to 'reelExtent'/);
  });

  it('symbolData({ id: { size: { w, h } } })', () => {
    expect(() =>
      new ReelSetBuilder().symbolData({ big: { size: { w: 2, h: 2 } } } as never),
    ).toThrowError(/symbolData\('big'\)\.size: 'w' was renamed to 'reels'/);
  });

  it('tumble({ fall: { rowStagger } })', () => {
    expect(() => new ReelSetBuilder().tumble({ fall: { rowStagger: 40 } } as never)).toThrowError(
      /tumble\(\{ fall \}\): 'rowStagger' was renamed to 'cellStagger'/,
    );
  });

  it('initialFrame([{ bufferAbove }])', () => {
    expect(() =>
      new ReelSetBuilder().initialFrame([{ visible: ['a'], bufferAbove: ['b'] }] as never),
    ).toThrowError(/initialFrame\(\) column 0: 'bufferAbove' was renamed to 'bufferStart'/);
  });

  it('offsetConfig({ topWidthFactor })', () => {
    expect(() =>
      new ReelSetBuilder().offsetConfig({ mode: 'trapezoid', topWidthFactor: 0.8 } as never),
    ).toThrowError(/offsetConfig\(\): 'topWidthFactor' was renamed to 'startFactor'/);
  });
});

describe('v1 option values throw by name', () => {
  it("reelAnchor('top')", () => {
    expect(() => new ReelSetBuilder().reelAnchor('top' as never)).toThrowError(
      /reelAnchor\(\): 'top' was renamed to 'start'/,
    );
  });

  it("reelAnchor('bottom')", () => {
    expect(() => new ReelSetBuilder().reelAnchor('bottom' as never)).toThrowError(
      /'bottom' was renamed to 'end'/,
    );
  });

  it("tumble({ fall: { cellOrder: 'bottomToTop' } })", () => {
    expect(() =>
      new ReelSetBuilder().tumble({ fall: { cellOrder: 'bottomToTop' } } as never),
    ).toThrowError(/'bottomToTop' was renamed to 'endFirst'/);
  });
});

describe('v2 shapes are accepted', () => {
  it('does not throw on the renamed equivalents', () => {
    expect(() =>
      new ReelSetBuilder()
        .bufferSymbols({ start: 1, end: 0 })
        .reelAnchor('start')
        .symbolData({ big: { size: { reels: 2, cells: 2 } } })
        .tumble({ fall: { cellStagger: 40, cellOrder: 'endFirst' } })
        .initialFrame([{ visible: ['a'], bufferStart: ['b'] }]),
    ).not.toThrow();
  });
});

describe('cascade grids go through the same gate as setResult', () => {
  // `refill()` and `runCascade`'s `nextGrid` used to skip validation
  // entirely, so a stale `bufferAbove` reached `columnTargetToStrip`, came
  // back `undefined`, and got silently random-filled on every cascade stage.
  const makeCascadeSet = () =>
    createTestReelSet({
      reels: 2,
      visibleCells: 3,
      symbolIds: ['a', 'b'],
      tumble: { fall: { duration: 0 }, dropIn: { duration: 0 } },
      initialFrame: [{ visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] }],
    });

  it('refill() rejects a v1 bufferAbove key', async () => {
    const h = makeCascadeSet();
    try {
      await expect(
        h.reelSet.refill({
          winners: [{ reel: 0, cell: 0 }],
          grid: [
            { visible: ['b', 'a', 'a'], bufferAbove: ['b'] },
            { visible: ['a', 'a', 'a'] },
          ] as never,
        }),
      ).rejects.toThrowError(/refill\(\): grid column 0: 'bufferAbove' was renamed to 'bufferStart'/);
    } finally {
      h.destroy();
    }
  });

  it('refill() rejects the removed string[][] form', async () => {
    const h = makeCascadeSet();
    try {
      await expect(
        h.reelSet.refill({
          winners: [{ reel: 0, cell: 0 }],
          grid: [['b', 'a', 'a'], ['a', 'a', 'a']] as never,
        }),
      ).rejects.toThrowError(/refill\(\): grid/);
    } finally {
      h.destroy();
    }
  });

  it("runCascade()'s nextGrid names itself, not refill()", async () => {
    const h = makeCascadeSet();
    try {
      await expect(
        h.reelSet.runCascade({
          detectWinners: (grid) => (grid[0][0] === 'a' ? [{ reel: 0, cell: 0 }] : []),
          nextGrid: () =>
            [
              { visible: ['b', 'a', 'a'], bufferBelow: ['b'] },
              { visible: ['a', 'a', 'a'] },
            ] as never,
          pauseAfterDestroyMs: 0,
        }),
      ).rejects.toThrowError(/runCascade\(\): nextGrid column 0: 'bufferBelow' was renamed to 'bufferEnd'/);
    } finally {
      h.destroy();
    }
  });
});
