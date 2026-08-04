/**
 * The banner-above-main composition (ADR 017's ReelStage shape), as the
 * `banner-ways` and `horizontal-banner` recipes build it: a HORIZONTAL reel
 * set placed above a vertical one, sharing a presentation.
 *
 * Nothing in the engine enforces this layout - two ReelSets are two
 * Containers - so it is exactly the kind of geometry that silently drifts
 * when the axis code changes. These assertions pin what "above" and
 * "aligned" actually mean in numbers.
 */
import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

const CELL = 78;
const GAP = 6;
const REELS = 5;
const CELLS = 3;

function build() {
  const ticker = new FakeTicker() as unknown as Ticker;
  const symbols = (r: { register: (id: string, C: unknown, o: unknown) => void }) => {
    for (const id of ['a', 'b', 'wild']) r.register(id, HeadlessSymbol, {});
  };

  // The main 5x3 vertical set.
  const main = new ReelSetBuilder()
    .reels(REELS)
    .visibleCells(CELLS)
    .symbolSize(CELL, CELL)
    .symbolGap(GAP, GAP)
    .symbols(symbols as never)
    .weights({ a: 1, b: 1, wild: 0 })
    .ticker(ticker)
    .build();

  // The banner: ONE reel whose strip runs sideways, one cell per main reel.
  const banner = new ReelSetBuilder()
    .orientation('horizontal')
    .reels(1)
    .visibleCells(REELS)
    .symbolSize(CELL, CELL)
    .symbolGap(GAP, 0)
    .symbols(symbols as never)
    .weights({ a: 1, b: 1, wild: 0 })
    .ticker(ticker)
    .build();
  return { main, banner };
}

/**
 * The composition as the recipe builds it: ONE container, laid out from its
 * own top-left. The recipe hands this back as `stage` and the runner scales
 * and centres it.
 */
function compose() {
  const { main, banner } = build();
  const stage = new Container();
  banner.y = 0;
  main.y = CELL + GAP * 3;
  stage.addChild(banner, main);
  return { stage, main, banner };
}

describe('a horizontal banner above a vertical 5x3 set', () => {
  it('is one reel of five cells, laid out along X', () => {
    const { main, banner } = build();
    try {
      expect(banner.reels).toHaveLength(1);
      expect(banner.reels[0].visibleCells).toBe(REELS);
      expect(banner.reels[0].axis.orientation).toBe('horizontal');
      // Cells march along X and share one Y.
      const c0 = banner.getCellBounds(0, 0);
      const c1 = banner.getCellBounds(0, 1);
      expect(c1.y).toBe(c0.y);
      expect(c1.x - c0.x).toBe(CELL + GAP);
      // The main set is the transpose: reels march along X, cells down Y.
      expect(main.reels).toHaveLength(REELS);
      expect(main.getCellBounds(1, 0).x - main.getCellBounds(0, 0).x).toBe(CELL + GAP);
      expect(main.getCellBounds(0, 1).y - main.getCellBounds(0, 0).y).toBe(CELL + GAP);
    } finally {
      main.destroy();
      banner.destroy();
    }
  });

  it('spans exactly the width of the main set', () => {
    const { main, banner } = build();
    try {
      const span = (s: typeof main, last: [number, number]) => {
        const a = s.getCellBounds(0, 0);
        const b = s.getCellBounds(last[0], last[1]);
        return b.x + b.width - a.x;
      };
      expect(span(banner, [0, REELS - 1])).toBe(REELS * CELL + (REELS - 1) * GAP);
      expect(span(banner, [0, REELS - 1])).toBe(span(main, [REELS - 1, 0]));
    } finally {
      main.destroy();
      banner.destroy();
    }
  });

  it('puts banner cell i directly above main reel i', () => {
    const { main, banner } = build();
    try {
      for (let i = 0; i < REELS; i++) {
        const b = banner.getCellBounds(0, i);
        const m = main.getCellBounds(i, 0);
        // Same column in stage space: the banner is only offset in Y.
        expect(b.x).toBe(m.x);
        expect(b.width).toBe(m.width);
      }
    } finally {
      main.destroy();
      banner.destroy();
    }
  });

  it('sits fully above the main set, with a visible gap and no overlap', () => {
    const { stage, main, banner } = compose();
    try {
      const bannerTop = banner.y + banner.getCellBounds(0, 0).y;
      const bannerBottom = bannerTop + banner.getCellBounds(0, 0).height;
      const mainTop = main.y + main.getCellBounds(0, 0).y;

      expect(bannerBottom).toBeLessThan(mainTop);
      expect(mainTop - bannerBottom).toBe(GAP * 3);
      expect(bannerBottom - bannerTop).toBe(CELL);
    } finally {
      stage.destroy({ children: true });
    }
  });
});

/**
 * The bug this composition shape exists to prevent.
 *
 * The recipe used to place the banner at a NEGATIVE y and add it straight to
 * `app.stage`, returning only the main set. The runner scales and centres the
 * object it is given, so the banner - not part of that object - kept unscaled
 * stage coordinates and rendered at the wrong size, nowhere near the grid it
 * is supposed to sit above.
 *
 * These pin the two properties the runner's fit math depends on.
 */
describe('the composition is what gets fitted', () => {
  it('contains BOTH sets, so scaling it moves the banner too', () => {
    const { stage, main, banner } = compose();
    try {
      expect(stage.children).toContain(banner);
      expect(stage.children).toContain(main);
      const before = banner.getGlobalPosition();
      stage.scale.set(0.5);
      stage.x = 100;
      // The banner tracks the container, which is the whole point.
      expect(banner.getGlobalPosition()).not.toEqual(before);
      expect(banner.parent).toBe(stage);
    } finally {
      stage.destroy({ children: true });
    }
  });

  it('is laid out from its own origin, so the fit centres it correctly', () => {
    const { stage, main, banner } = compose();
    try {
      // The runner derives its scale from `width`/`height` and positions the
      // ORIGIN, which is only correct when nothing sits at a negative offset.
      // (Pixi bounds are empty under HeadlessSymbol - it renders nothing - so
      // assert the layout that produces them rather than the bounds.)
      for (const child of stage.children) {
        expect(child.x).toBeGreaterThanOrEqual(0);
        expect(child.y).toBeGreaterThanOrEqual(0);
      }
      expect(banner.y).toBe(0);
      expect(main.y).toBe(CELL + GAP * 3);
      // Composition height: banner strip + gap + the grid's own cells.
      const gridBottom =
        main.y + main.getCellBounds(0, CELLS - 1).y + main.getCellBounds(0, CELLS - 1).height;
      expect(gridBottom).toBe(CELL + GAP * 3 + CELLS * CELL + (CELLS - 1) * GAP);
    } finally {
      stage.destroy({ children: true });
    }
  });
});
