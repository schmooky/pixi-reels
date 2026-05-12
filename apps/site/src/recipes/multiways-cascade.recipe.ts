// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   DropRecipes, PIXI, gsap, app, runCascade

// MultiWays + Cascade together. Every spin:
//   1. setShape(rowsPerReel) rolls a per-reel row count in [minRows, maxRows].
//   2. spin({ mode: 'cascade' }) — DropStartPhase, then SpinPhase waiting for
//      setResult, then AdjustPhase commits the new shape, then DropStopPhase
//      falls the old grid out and drops the new grid in from above.
//   3. If the landing has a horizontal triple anywhere, runCascade pops the
//      winners and tumbles a fresh row in. One pop per round to keep the
//      demo legible.
//
// The shape change happens at the START of each spin, before the cascade
// drop-in. Mid-cascade reshape is not supported — every cascade respin
// within a single round keeps the shape established by the spin that
// started the round (see ADR 015).

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 5;
const REEL_PIXEL_HEIGHT = 360;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 4;

const IDS = ['7', '8', '9', '10', 'J', 'Q'];

function randomShape() {
  return Array.from({ length: REELS }, () =>
    MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
  );
}

function randomGrid(shape, forceTripleRow) {
  // Build a grid matching `shape` exactly. If forceTripleRow is a row index,
  // plant the same symbol across cols 0..2 at that row so there's a guaranteed
  // 3-in-a-row to cascade.
  const grid = shape.map((rows) =>
    Array.from({ length: rows }, () => IDS[Math.floor(Math.random() * IDS.length)]),
  );
  if (forceTripleRow !== null && forceTripleRow !== undefined) {
    const cluster = IDS[Math.floor(Math.random() * IDS.length)];
    for (let c = 0; c < 3; c++) {
      if (grid[c].length > forceTripleRow) grid[c][forceTripleRow] = cluster;
    }
  }
  return grid;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, {
          color: sym.color, label: sym.label, textColor: sym.textColor,
        });
      }
    }
  })
  .cascade(DropRecipes.cascadeDrop)
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

// Banner above the grid: shape + ways count, like the plain multiways recipe.
const bannerHeight = 32;
const banner = new PIXI.Container();
reelSet.addChild(banner);
banner.y = -bannerHeight - 8;

const bannerBg = new PIXI.Graphics();
banner.addChild(bannerBg);

const bannerText = new PIXI.Text({
  text: 'READY — press spin',
  style: {
    fontFamily: '"Roboto Condensed", "Arial Narrow", system-ui, sans-serif',
    fontSize: 13, fontWeight: '700',
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
redrawBanner('READY — press spin');

return {
  reelSet,
  onSpin: async () => {
    // Force a 3-in-a-row on every 2nd round so the cascade chain is visible
    // often enough to read. The row only exists if every column has enough
    // rows to host it; pick the smallest reel and target row 0 (always present).
    const shape = randomShape();
    const ways = shape.reduce((a, b) => a * b, 1);
    const forceTriple = Math.random() < 0.6 ? 0 : null;

    redrawBanner(`SPINNING — shape [${shape.join(', ')}] = ${ways.toLocaleString()} ways`);

    // Cascade-mode spin on a multiways slot: DropStart → Spin → Adjust → DropStop.
    const stage0 = randomGrid(shape, forceTriple);
    const p = reelSet.spin({ mode: 'cascade' });
    await new Promise((r) => setTimeout(r, 80));
    reelSet.setShape(shape);
    reelSet.setResult(stage0);
    await p;

    redrawBanner(`LANDED — shape [${shape.join(', ')}] = ${ways.toLocaleString()} ways`);

    // Find a 3-in-a-row to cascade. Walk every row that exists on cols 0..2;
    // a triple needs the same symbol at the same row on three adjacent cols.
    const triple = findTriple(stage0);
    if (!triple) return;

    await new Promise((r) => setTimeout(r, 280));
    redrawBanner('CASCADE — winners pop');

    // Build stage 1: at the winning row in the winning columns, drop the
    // cell above (or a new random) into the cleared slot. Other columns
    // are untouched. cascadeLoop skips reels with no winners.
    const stage1 = stage0.map((col, c) => {
      if (c < triple.startCol || c >= triple.startCol + 3) return [...col];
      const next = [...col];
      const row = triple.row;
      for (let r = row; r > 0; r--) next[r] = next[r - 1];
      next[0] = IDS[Math.floor(Math.random() * IDS.length)];
      return next;
    });

    await runCascade(reelSet, [stage0, stage1], {
      winners: () => [
        { reel: triple.startCol,     row: triple.row },
        { reel: triple.startCol + 1, row: triple.row },
        { reel: triple.startCol + 2, row: triple.row },
      ],
      vanishDuration: 300,
      dropDuration: 420,
      pauseBetween: 140,
    });

    redrawBanner(`DONE — shape [${shape.join(', ')}] = ${ways.toLocaleString()} ways`);
  },
  cleanup: () => {
    try { banner.destroy({ children: true }); } catch { /* ignore */ }
  },
};

function findTriple(grid) {
  // Scan rows that exist across cols 0, 1, 2 (or 1,2,3 etc.) for a matching id.
  for (let startCol = 0; startCol + 2 < grid.length; startCol++) {
    const minRows = Math.min(grid[startCol].length, grid[startCol + 1].length, grid[startCol + 2].length);
    for (let row = 0; row < minRows; row++) {
      const id = grid[startCol][row];
      if (id === grid[startCol + 1][row] && id === grid[startCol + 2][row]) {
        return { startCol, row, id };
      }
    }
  }
  return null;
}
