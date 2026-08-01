/**
 * ADR 018 L12 / L13 at the `ReelSet` level.
 *
 * The motion contract proves the strip physics generalize. These prove the
 * SET generalizes: geometry, landing and the visible grid. That is the layer
 * the motion contract cannot see, and the one where an axis mistake actually
 * reaches a player - a transposed `getCellBounds` renders the whole board
 * sideways while every ReelMotion law still passes.
 *
 * The transposition is exact, not approximate: a horizontal set built with
 * `symbolSize(H, W)` and `symbolGap({ x: gy, y: gx })` must produce, for
 * every cell, the vertical set's bounds with x/y and width/height swapped.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { CellBounds } from '../../src/config/types.js';

const REELS = 4;
const CELLS = 3;
const W = 120;
const H = 100;
const GAP_X = 8;
const GAP_Y = 6;
const IDS = ['a', 'b', 'c', 'd'];

/** The grid both sets land on. Identical indices, whichever way the strip runs. */
const GRID = Array.from({ length: REELS }, (_, r) =>
  Array.from({ length: CELLS }, (_, c) => IDS[(r + c) % IDS.length]),
);

const vertical = () =>
  createTestReelSet({
    reels: REELS,
    visibleCells: CELLS,
    symbolIds: IDS,
    symbolSize: { width: W, height: H },
    symbolGap: { x: GAP_X, y: GAP_Y },
  });

/** The same board, transposed: main axis is x, so width carries the cell pitch. */
const horizontal = () =>
  createTestReelSet({
    reels: REELS,
    visibleCells: CELLS,
    symbolIds: IDS,
    orientation: 'horizontal',
    symbolSize: { width: H, height: W },
    symbolGap: { x: GAP_Y, y: GAP_X },
  });

const transpose = (b: CellBounds): CellBounds => ({
  x: b.y,
  y: b.x,
  width: b.height,
  height: b.width,
});

describe('L12 ISOMORPHISM - a horizontal ReelSet is a vertical one transposed', () => {
  it('every cell rect is the vertical rect with x/y and width/height swapped', () => {
    const v = vertical();
    const h = horizontal();
    try {
      for (let r = 0; r < REELS; r++) {
        for (let c = 0; c < CELLS; c++) {
          // Anchor the vertical side to plain arithmetic FIRST. Comparing the
          // two sets to each other is not enough on its own: a transposition
          // applied inside the shared projection breaks both sides
          // identically, and the relative law still holds. Ask the mutation
          // "swap toScreen's arguments" - it passes a purely relative check.
          expect({ reel: r, cell: c, ...v.reelSet.getCellBounds(r, c) }).toEqual({
            reel: r,
            cell: c,
            x: r * (W + GAP_X),
            y: c * (H + GAP_Y),
            width: W,
            height: H,
          });
          expect({ reel: r, cell: c, ...h.reelSet.getCellBounds(r, c) }).toEqual({
            reel: r,
            cell: c,
            ...transpose(v.reelSet.getCellBounds(r, c)),
          });
        }
      }
    } finally {
      v.destroy();
      h.destroy();
    }
  });

  it('lands the identical visible grid', async () => {
    const v = vertical();
    const h = horizontal();
    try {
      await v.spinAndLand(GRID);
      await h.spinAndLand(GRID);
      expect(h.reelSet.getVisibleGrid()).toEqual(v.reelSet.getVisibleGrid());
      expect(h.reelSet.getVisibleGrid()).toEqual(GRID);
    } finally {
      v.destroy();
      h.destroy();
    }
  });

  it('marches reels along the cross axis, one cell plus the cross gap apart', () => {
    const v = vertical();
    const h = horizontal();
    try {
      // Vertical: reels march on x by (width + gap.x). Horizontal: on y by
      // the same distance, because the cross cell size is the height there.
      const vStep = v.reelSet.getCellBounds(1, 0).x - v.reelSet.getCellBounds(0, 0).x;
      const hStep = h.reelSet.getCellBounds(1, 0).y - h.reelSet.getCellBounds(0, 0).y;
      expect(vStep).toBe(W + GAP_X);
      expect(hStep).toBe(vStep);
      // ...and cells march along the main axis by (cell size + main gap).
      const vCell = v.reelSet.getCellBounds(0, 1).y - v.reelSet.getCellBounds(0, 0).y;
      const hCell = h.reelSet.getCellBounds(0, 1).x - h.reelSet.getCellBounds(0, 0).x;
      expect(vCell).toBe(H + GAP_Y);
      expect(hCell).toBe(vCell);
    } finally {
      v.destroy();
      h.destroy();
    }
  });
});

describe('L13 MIRROR - direction changes travel, never the board', () => {
  const build = (direction: 'forward' | 'reverse') =>
    createTestReelSet({
      reels: REELS,
      visibleCells: CELLS,
      symbolIds: IDS,
      symbolSize: { width: W, height: H },
      symbolGap: { x: GAP_X, y: GAP_Y },
      direction,
    });

  it('a reverse set has identical cell geometry to a forward one', () => {
    const f = build('forward');
    const r = build('reverse');
    try {
      for (let reel = 0; reel < REELS; reel++) {
        for (let cell = 0; cell < CELLS; cell++) {
          expect(r.reelSet.getCellBounds(reel, cell)).toEqual(
            f.reelSet.getCellBounds(reel, cell),
          );
        }
      }
    } finally {
      f.destroy();
      r.destroy();
    }
  });

  it('a reverse set lands the identical visible grid', async () => {
    const f = build('forward');
    const r = build('reverse');
    try {
      await f.spinAndLand(GRID);
      await r.spinAndLand(GRID);
      expect(r.reelSet.getVisibleGrid()).toEqual(f.reelSet.getVisibleGrid());
      expect(r.reelSet.getVisibleGrid()).toEqual(GRID);
    } finally {
      f.destroy();
      r.destroy();
    }
  });

  it('mixed directionPerReel still lands the identical visible grid', async () => {
    const mixed = createTestReelSet({
      reels: REELS,
      visibleCells: CELLS,
      symbolIds: IDS,
      symbolSize: { width: W, height: H },
      symbolGap: { x: GAP_X, y: GAP_Y },
      directionPerReel: ['forward', 'reverse', 'forward', 'reverse'],
    });
    try {
      await mixed.spinAndLand(GRID);
      expect(mixed.reelSet.getVisibleGrid()).toEqual(GRID);
    } finally {
      mixed.destroy();
    }
  });
});

describe('ADR 017 - facing is invariant under travel', () => {
  const combos = [
    ['vertical', 'forward'],
    ['vertical', 'reverse'],
    ['horizontal', 'forward'],
    ['horizontal', 'reverse'],
  ] as const;

  it.each(combos)(
    '%s / %s: no symbol view is rotated, scaled or mirrored',
    async (orientation, direction) => {
      const h = createTestReelSet({
        reels: REELS,
        visibleCells: CELLS,
        symbolIds: IDS,
        orientation,
        direction,
        symbolSize:
          orientation === 'vertical' ? { width: W, height: H } : { width: H, height: W },
      });
      try {
        const check = () => {
          for (const reel of h.reelSet.reels) {
            for (const sym of reel.symbols) {
              expect(sym.view.rotation).toBe(0);
              expect(sym.view.scale.x).toBe(1);
              expect(sym.view.scale.y).toBe(1);
            }
          }
        };
        check();
        const spin = h.reelSet.spin();
        h.advance(200);
        check();
        h.reelSet.setResult(GRID.map((visible) => ({ visible })));
        h.reelSet.slamStop();
        await spin;
        check();
      } finally {
        h.destroy();
      }
    },
  );
});
