// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   loadGeneratedSpines, buildSpineMap, PIXI, gsap, app,
//                   textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Per-reel static shape (3-5-5-5-3 pyramid) rendered with Spine symbols.
// Spine skeletons scale cleanly to whatever cell size each reel hands them —
// the outer 3-row reels get taller cells than the inner 5-row reels, and
// the rig stays crisp at both because it's vector, not a baked sprite.

await loadGeneratedSpines();

const VISIBLE = [3, 5, 5, 5, 3];
// 140 = the spines' authored frame size — render 1:1 to keep frame strokes
// crisp. Spine still scales the rig if individual cells get smaller in tight
// reshapes, but the baseline matches the bake.
const SIZE = 140;
const GAP = 4;

const SPINE_MAP = {
  '9':  'low_a',
  '10': 'low_k',
  J:    'low_q',
  Q:    'low_j',
  K:    'mid_1',
  A:    'high_1',
};
const IDS = Object.keys(SPINE_MAP);

const reelSet = new ReelSetBuilder()
  .reels(VISIBLE.length)
  .visibleRowsPerReel(VISIBLE)
  .reelAnchor('center')
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    const spineMap = buildSpineMap(SPINE_MAP);
    for (const id of IDS) {
      registry.register(id, SpineReelSymbol, {
        spineMap,
        autoPlayLanding: true,
      });
    }
  })
  .weights(Object.fromEntries(IDS.map((id, i) => [id, 12 - i])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Sync idle across every spine symbol once the spin fully completes.
// Reels touch down staggered, so per-symbol idle would also start
// staggered. After spin:complete + a short wait for landing one-shots
// to finish, restart idle on every visible symbol so the breathing
// loops are time-aligned.
const LANDING_MS = 350;
function syncIdle() {
  for (let r = 0; r < reelSet.reelCount; r++) {
    const reel = reelSet.getReel(r);
    for (let row = 0; row < reel.visibleRows; row++) {
      const sym = reel.getSymbolAt(row);
      if (sym instanceof SpineReelSymbol) sym.stopAnimation();
    }
  }
}
reelSet.events.on('spin:complete', () => {
  setTimeout(syncIdle, LANDING_MS);
});

return {
  reelSet,
  nextResult: () =>
    VISIBLE.map((rows) =>
      Array.from({ length: rows }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
