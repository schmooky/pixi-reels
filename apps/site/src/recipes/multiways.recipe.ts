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
// across reels. The banner above the grid prints both the per-reel
// shape and the total ways for each landing.

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
class MultiwaysSymbol extends SpineReelSymbol {
  resize(width, height) {
    super.resize(width, height);
    const spine = this.spine;
    if (!spine || !height) return;
    const skinName = multiwaysSkinName(this.symbolId, REEL_PIXEL_HEIGHT / height);
    if (spine.skeleton.skin?.name !== skinName) {
      spine.skeleton.setSkinByName(skinName);
      spine.skeleton.setSlotsToSetupPose();
      spine.update(0);
    }
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

// Banner above the grid: prints the per-reel shape + total ways for
// the current landing, so the variation is unmistakable on every spin.
const bannerHeight = 36;
const banner = new PIXI.Container();
reelSet.addChild(banner);
banner.y = -bannerHeight - 8;

const bannerBg = new PIXI.Graphics();
banner.addChild(bannerBg);

const bannerText = new PIXI.Text({
  text: 'READY. press spin',
  style: {
    fontFamily: '"Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
    fontSize: 14, fontWeight: '700',
    fill: 0xffffff,
    letterSpacing: 1,
  },
});
bannerText.anchor.set(0.5);
bannerText.y = bannerHeight / 2;
banner.addChild(bannerText);

function redrawBanner(text) {
  const width = REELS * (CELL_W + GAP) - GAP;
  bannerBg
    .clear()
    .roundRect(0, 0, width, bannerHeight, 8)
    .fill({ color: 0x1e293b })
    .stroke({ width: 2, color: 0xfef08a, alpha: 0.5 });
  bannerText.text = text;
  bannerText.x = width / 2;
}
redrawBanner('READY. press spin');

reelSet.events.on('spin:allLanded', () => {
  const visibleRowsPerReel = reelSet.reels.map((r) => r.visibleRows);
  const ways = visibleRowsPerReel.reduce((a, b) => a * b, 1);
  redrawBanner(`SHAPE [${visibleRowsPerReel.join(', ')}] = ${ways.toLocaleString()} ways`);
});
reelSet.events.on('spin:start', () => redrawBanner('SPINNING…'));

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
  cleanup: () => {
    try { banner.destroy({ children: true }); } catch { /* ignore */ }
  },
};
