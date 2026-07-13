// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadThunderkickSpines, buildThunderkickSpineMap,
//                   app, pickWeighted
//
// symbolData `unmask: true` — the declarative fix, on a rectangular grid.
// Unmasked symbols are parented to the viewport-wide unmaskedContainer:
// above EVERY reel and outside the mask, so the jaw overflows the grid
// edges and its right-hand neighbours with zero recipe code. Scatters are
// forced onto edge rows so the out-of-mask peek is obvious.
//
// (This is per-symbol-id and rectangular-only: unmask throws on jagged
// center-anchored layouts — see the third demo for those.)

await loadThunderkickSpines();

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;

const spineMap = buildThunderkickSpineMap();

const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6, high: 4,
};

const REELS = 6;
const ROWS = 4;

const cache = new SpinTextureCache({ renderer: app.renderer });
const createInner = () =>
  new SpineReelSymbol({
    spineMap,
    scale: SPINE_SCALE,
    landingAnimation: 'land',
    autoPlayLanding: true,
  });

prewarmSpinTextures({
  cache,
  ids: [...Object.keys(weights), 'scatter'],
  createSymbol: createInner,
  width: CELL_W,
  height: CELL_H,
});

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 0)
  .symbols((r) => {
    for (const id of [...Object.keys(weights), 'scatter']) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  // unmask parents the scatter into viewport.unmaskedContainer: above every
  // reel AND outside the mask. zIndex still sorts within that container.
  .symbolData({ scatter: { zIndex: 10, unmask: true } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => pickWeighted(weights)),
    );
    // Two scatters on edge rows (top or bottom) so the jaw visibly pokes
    // out of the mask; one of them on a left reel so it overlaps the
    // neighbour to its right.
    const reels = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 2);
    for (const reel of reels) {
      grid[reel][Math.random() < 0.5 ? 0 : ROWS - 1] = 'scatter';
    }
    return grid;
  },
};
