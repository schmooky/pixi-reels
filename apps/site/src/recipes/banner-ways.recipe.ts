// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// A horizontal banner above a 5x3 WAYS set, participating in the win. The banner
// is a "6th reel": a wild in the banner cell above a column makes that column
// count as a matching column, extending the way. pixi-reels never computes wins
// (ADR 007) - the recipe scripts the ways math and spotlights the cells; the
// engine spins and lands BOTH sets through the same lifecycle. This is the
// ReelStage composition (ADR 017): two ReelSets sharing one presentation.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const W = { '7': 20, '8': 18, '9': 16, '10': 12, J: 10, Q: 8, K: 6, A: 5, wild: 0 };
const registerAll = (r) => {
  for (const s of SYMBOLS) {
    r.register(s.id, CardSymbol, { color: s.color, label: s.label, textColor: s.textColor });
  }
};

const CELL = 78;
const GAP = 6;

// The main 5x3 ways set (the runner adds this to the stage).
const main = new ReelSetBuilder()
  .reels(5)
  .visibleCells(3)
  .symbolSize(CELL, CELL)
  .symbolGap(GAP, GAP)
  .symbols(registerAll)
  .weights(W)
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

// The horizontal banner (1 reel x 5 cells) sits above the main set.
const banner = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(1)
  .visibleCells(5)
  .symbolSize(CELL, CELL)
  .symbolGap(GAP, 0)
  .symbols(registerAll)
  .weights({ ...W, wild: 5 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();
banner.y = -(CELL + GAP * 3);
app.stage.addChild(banner);

const PAY = 'A';

const onSpin = async () => {
  main.spotlight.hide();
  banner.spotlight.hide();

  // Script a base 3-reel way (reels 0-2, middle row) plus a banner wild over
  // reel 3 that extends it to a 4-reel way.
  const grid = Array.from({ length: 5 }, () => [pickWeighted(W), pickWeighted(W), pickWeighted(W)]);
  grid[0][1] = PAY;
  grid[1][1] = PAY;
  grid[2][1] = PAY;
  const row = Array.from({ length: 5 }, () => pickWeighted(W));
  row[3] = 'wild';

  const pm = main.spin();
  main.setResult(grid.map((visible) => ({ visible })));
  const pb = banner.spin();
  banner.setResult([row]);
  await Promise.all([pm, pb]);

  // Ways pay left-to-right on consecutive reels. A reel contributes if it shows
  // PAY, or the banner cell above it is a wild (the banner joins the way).
  const g = main.getVisibleGrid();
  const b = banner.getVisibleGrid()[0];
  const winners = [];
  const bannerWinners = [];
  for (let reel = 0; reel < 5; reel++) {
    const cells = [];
    for (let r = 0; r < 3; r++) if (g[reel][r] === PAY) cells.push(r);
    const bannerWild = b[reel] === 'wild';
    if (cells.length === 0 && !bannerWild) break;
    for (const r of cells) winners.push({ reelIndex: reel, cellIndex: r });
    if (bannerWild) bannerWinners.push({ reelIndex: 0, cellIndex: reel });
  }
  await Promise.all([
    winners.length ? main.spotlight.show(winners, { playWinAnimation: true }) : Promise.resolve(),
    bannerWinners.length ? banner.spotlight.show(bannerWinners, { playWinAnimation: true }) : Promise.resolve(),
  ]);
};

return { reelSet: main, onSpin, cleanup: () => banner.destroy() };
