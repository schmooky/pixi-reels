// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadThunderkickSpines, buildThunderkickSpineMap,
//                   THUNDERKICK_SYMBOL_IDS, app, pickWeighted
//
// Real production art on a compact 3-4-4-4-4-3 grid. Each symbol tier is
// ONE multi-skin skeleton (lowSymbols carries low1..low5 as skins), mapped
// via spineMap's `skin`. The spin uses the engine's static-spin feature:
// every cell swaps to a cached snapshot texture with auto-baked motion
// blur, so no skeleton ticks while the reels turn.

await loadThunderkickSpines();

// The symbol plates measure exactly 175x203 (setup-pose bounds of the tier
// skeletons; scatter/mystery intentionally overflow their tile). Cells match
// the plates 1:1 with no gap - the grid is compact, cell edge to cell edge.
const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;

const spineMap = buildThunderkickSpineMap();

const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6,
  high: 4, wild: 3, mystery: 3, scatter: 2,
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

// One scratch symbol bakes the static + blurred texture for every id.
prewarmSpinTextures({
  cache,
  ids: THUNDERKICK_SYMBOL_IDS,
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
    for (const id of THUNDERKICK_SYMBOL_IDS) {
      r.register(id, StaticSpinSymbol, {
        createInner,
        cache,
        blurRampMs: 160,
      });
    }
  })
  .weights(weights)
  // Scatter, mystery, and wild art overflow their 175x203 tile - keep them
  // painted above neighbouring cells.
  .symbolData({ scatter: { zIndex: 10 }, mystery: { zIndex: 6 }, wild: { zIndex: 5 } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    ROWS_PER_REEL.map((rows) =>
      Array.from({ length: rows }, () => pickWeighted(weights)),
    ),
};
