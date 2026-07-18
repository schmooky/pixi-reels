// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   loadMultiwaysSpines, buildMultiwaysSpineMap,
//                   multiwaysSkinName, MULTIWAYS_SYMBOL_IDS,
//                   MULTIWAYS_AUTHORED_REEL_H, MULTIWAYS_AUTHORED_CELL_W,
//                   PIXI, gsap, app, pickWeighted
//
// MultiWays. per-spin row variation. Each reel lands on a different
// row count in [minRows, maxRows]. The reel pixel height is fixed;
// cell height per reel is derived live as
// `reelPixelHeight / visibleRows[i]`, so a 2-row reel has tall cells
// and a 7-row reel has short ones. `setShape(rowsPerReel)` is called
// between `spin()` and `setResult()`; AdjustPhase reshapes the reels
// between SPIN and STOP.
//
// 6 reels x [2, 7] rows = up to 117,649 distinct landings (7^6). The
// "ways" count for any individual spin is the product of visibleRows
// across reels.

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 360;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;

await loadMultiwaysSpines();

const SPINE_SCALE = REEL_PIXEL_HEIGHT / MULTIWAYS_AUTHORED_REEL_H;
const CELL_W = MULTIWAYS_AUTHORED_CELL_W * SPINE_SCALE;
const IDS = [...MULTIWAYS_SYMBOL_IDS];

// Every symbol is authored once per ROW COUNT (skins `<id>/size<rows>`,
// rows 2..7). The stretched multiways cell height reveals the reel's
// row count (cellH = reelPixelHeight / rows), so resize() re-skins the
// skeleton to the matching variant. One uniform SPINE_SCALE fits every
// skin: each size ladder implies the same authored reel height (~617).
// The high skeleton ships ALL SIX size variants in its DEFAULT skin (the
// size skins are empty selectors), so a naive load renders six stacked
// gold frames/backplates. the production runtime hides inactive sizes in
// code. Mirror that with a per-frame hook (spine-pixi-v8 runs it after
// state.apply, before world transforms): null every per-size slot that
// doesn't match the reel's row count. Slot-name grammar, from the export:
// high<N>_*, glow_<N>_*, radialGradient_<N>, and the two _<N>-suffixed
// corner slots. particle_2_* is a particle TYPE, not a size. shared.
function highSlotSize(name) {
  let m = name.match(/^high(\d)_/);
  if (m) return +m[1];
  m = name.match(/^high_frame_corner_large_(?:btm|top)_(\d)$/);
  if (m) return +m[1];
  m = name.match(/^glow_(\d)_/);
  if (m) return +m[1];
  m = name.match(/^radialGradient_(\d)$/);
  if (m) return +m[1];
  return null;
}

class MultiwaysSymbol extends SpineReelSymbol {
  resize(width, height) {
    super.resize(width, height);
    const spine = this.spine;
    if (!spine || !height) return;
    const rows = Math.max(2, Math.min(7, Math.round(REEL_PIXEL_HEIGHT / height)));
    const skinName = multiwaysSkinName(this.symbolId, rows);
    if (spine.skeleton.skin?.name !== skinName) {
      spine.skeleton.setSkinByName(skinName);
      spine.skeleton.setSlotsToSetupPose();
    }
    if (this.symbolId === 'high') {
      spine.beforeUpdateWorldTransforms = (s) => {
        for (const slot of s.skeleton.slots) {
          const size = highSlotSize(slot.data.name);
          if (size !== null && size !== rows) slot.setAttachment(null);
        }
      };
    }
    spine.update(0); // apply skin + slot gate now, not on the next tick
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .pinMigrationDuration(300)
  .pinMigrationEase('power2.inOut')
  .symbolSize(CELL_W, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    // Namespaced animation vocabulary: general/* + wins/*.
    const spineMap = buildMultiwaysSpineMap(MAX_ROWS);
    for (const id of IDS) {
      registry.register(id, MultiwaysSymbol, {
        spineMap,
        scale: SPINE_SCALE,
        idleAnimation: 'general/idle',
        landingAnimation: 'general/land',
        winAnimation: 'wins/win',
        autoPlayLanding: true,
      });
    }
  })
  .weights(Object.fromEntries(IDS.map((id, i) => [id, 16 - i])))
  // Big symbols visually overshoot at landing on this layout. set
  // bounceDistance: 0 so each cell snaps flush regardless of which
  // shape was rolled this spin.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const shape = Array.from({ length: REELS }, () =>
      MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
    );
    reelSet.setShape(shape);
    return shape.map((rows) =>
      Array.from({ length: rows }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    );
  },
};
