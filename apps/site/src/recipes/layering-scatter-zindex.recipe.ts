// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadThunderkickSpines, buildThunderkickSpineMap,
//                   app, pickWeighted
//
// symbolData zIndex - layering WITHIN one reel. The scatter (zIndex: 10)
// always paints above its reel-mates; the mystery bush is deliberately
// left at the default layer, so the tile below it paints over its leaves
// (bottom rows draw in front within a layer). Spot the difference each
// spin: jaw never clipped, bush clipped from below.

await loadThunderkickSpines();

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;

const spineMap = buildThunderkickSpineMap();

const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6, high: 4,
};

const ROWS_PER_REEL = [3, 4, 4, 4, 4, 3];

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
  ids: [...Object.keys(weights), 'scatter', 'mystery'],
  createSymbol: createInner,
  width: CELL_W,
  height: CELL_H,
});

const reelSet = new ReelSetBuilder()
  .reels(6)
  .visibleCellsPerReel(ROWS_PER_REEL)
  .reelAnchor('center')
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 0)
  .symbols((r) => {
    for (const id of [...Object.keys(weights), 'scatter', 'mystery']) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  // The lesson: scatter is elevated, mystery is NOT (default layer) -
  // watch the bush get clipped by the tile below it while the jaw never is.
  .symbolData({ scatter: { zIndex: 10 } })
  // Synchronized settle: all reels start and stop together (no stagger),
  // and land with no bounce so the whole grid comes to rest as one.
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const grid = ROWS_PER_REEL.map((rows) =>
      Array.from({ length: rows }, () => pickWeighted(weights)),
    );
    // One scatter and one mystery per spin, in middle rows of the tall
    // reels so both always have a neighbour below to fight with.
    const midReels = [1, 2, 3, 4];
    const sReel = midReels[Math.floor(Math.random() * midReels.length)];
    let mReel = midReels[Math.floor(Math.random() * midReels.length)];
    if (mReel === sReel) mReel = midReels[(midReels.indexOf(mReel) + 1) % midReels.length];
    grid[sReel][1 + Math.floor(Math.random() * 2)] = 'scatter';
    grid[mReel][1 + Math.floor(Math.random() * 2)] = 'mystery';
    return grid;
  },
};
