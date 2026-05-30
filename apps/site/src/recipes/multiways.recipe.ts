// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
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

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .pinMigrationDuration(300)
  .pinMigrationEase('power2.inOut')
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
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
  const width = REELS * (SYMBOL_SIZE + GAP) - GAP;
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
      Array.from({ length: rows }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );
  },
  cleanup: () => {
    try { banner.destroy({ children: true }); } catch { /* ignore */ }
  },
};
