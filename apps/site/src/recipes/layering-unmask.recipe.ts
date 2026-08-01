// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadThunderkickSpines, buildThunderkickSpineMap,
//                   app, pickWeighted
//
// symbolData `unmask: true`, the declarative fix, on the SAME jagged
// 3-4-4-4-4-3 grid as the other demos. On land, unmasked scatters are
// parented to the viewport-wide unmaskedContainer: above EVERY reel and
// outside the mask, so the jaw overflows the grid edges and its right-hand
// neighbours with zero recipe code. The engine bakes each reel's offset
// into the lifted view, so this works on offset (center-anchored) reels
// too, no manual promotion needed.

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
  ids: [...Object.keys(weights), 'scatter'],
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
    for (const id of [...Object.keys(weights), 'scatter']) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  // unmask parents the scatter into viewport.unmaskedContainer on land:
  // above every reel AND outside the mask. zIndex still sorts within that
  // container. The reel's mainOffset is baked in, so the short outer reels
  // (which are centre-shifted) line up correctly.
  .symbolData({ scatter: { zIndex: 10, unmask: true } })
  // Synchronized settle: all reels start and stop together (no stagger),
  // and land with no bounce so the whole grid comes to rest as one.
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const grid = ROWS_PER_REEL.map((cells) =>
      Array.from({ length: cells }, () => pickWeighted(weights)),
    );
    // Scatters on the short outer reels (0 and 5) at their edge cells, so
    // the jaw pokes past the stepped grid outline AND the neighbour - the
    // exact case that needs the reel offset baked into the lifted view.
    grid[0][Math.random() < 0.5 ? 0 : grid[0].length - 1] = 'scatter';
    grid[5][Math.random() < 0.5 ? 0 : grid[5].length - 1] = 'scatter';
    return grid;
  },
};
