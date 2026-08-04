// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadSpineSet,
//           buildSpineMap, app

// Bend the whole reel, not each symbol.
//
// `.curveMode('warp')` renders each reel to a texture and draws it through a
// mesh whose VERTICES are displaced by the projection. Everything inside bends
// - Spine skeletons, atlas sprites, text, effects - and no symbol has to
// cooperate or even know the reel is curved.
//
// These are Spine skeletons, which the per-symbol path cannot bend at all: a
// `Container` transform is affine, so it can only displace and scale a live
// skeleton. Here they curve like everything else.
//
// The other thing the warp buys you is MOTION. Because the bend is applied to
// the rendered reel rather than baked into each cell, anything that moves the
// strip travels along the curve for free - the spin, the stop bounce, cascade
// falls. On the per-symbol path the bounce is a flat translation of the reel
// container, so the whole board slides straight up and down instead of riding
// the drum.
//
// Costs: one render pass per reel per frame, and the reel is resampled once,
// so hairline art is marginally softer. Needs `.renderer(app.renderer)`.

await loadSpineSet('generated');

const SPINE_MAP = {
  '9': 'low_a',
  '10': 'low_k',
  J: 'low_q',
  Q: 'low_j',
  K: 'mid_1',
  A: 'high_1',
};
const IDS = Object.keys(SPINE_MAP);

const REELS = 5;
const CELLS = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(96, 96)
  .symbolGap(6, 6)
  .curve(0.45)
  .curveFocus('set-lean')
  .curveMode('warp') // <- bend the container, not the cells
  .renderer(app.renderer)
  .symbols((r) => {
    const spineMap = buildSpineMap(SPINE_MAP);
    for (const id of IDS) {
      r.register(id, SpineReelSymbol, { spineMap, autoPlayLanding: true });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
