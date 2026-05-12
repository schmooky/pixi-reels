// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, runCascade

// MultiWays + cascade tumble.
//
// Visual flow on each round:
//   1. setShape(rowsPerReel) rolls a per-reel row count in [minRows, maxRows].
//   2. reelSet.spin() — classic strip-spin lands the multiways grid.
//      AdjustPhase reshapes between SPIN and STOP, so the landing already
//      shows the new per-reel row count.
//   3. If three of the same symbol land in a row across cols 0..2 (or 1..3,
//      or 2..4), runCascade pops them; survivors fall, new symbols drop in
//      from above — the cascade tumble visual, on a multiways shape.
//
// `runCascade` operates on the live grid via per-reel `placeSymbols(...)` and
// is shape-aware — it reads each reel's visibleRows at call time, so a 2-row
// reel and a 5-row reel cascade independently within the same chain.

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

function findTriple(grid) {
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
  // bounceDistance: 0 — big symbols visually overshoot on a multiways
  // landing, same fix as the plain multiways recipe.
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const shape = randomShape();
    // Force a 3-in-a-row about 60% of the time so the cascade chain
    // is visible often. The target row is 0 (always present, even on
    // a 2-row reel).
    const forceTriple = Math.random() < 0.6 ? 0 : null;

    // Round 1 — classic strip-spin on a multiways slot.
    // AdjustPhase reshapes between SPIN and STOP via setShape(...).
    const stage0 = randomGrid(shape, forceTriple);
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 120));
    reelSet.setShape(shape);
    reelSet.setResult(stage0);
    await p;
    await new Promise((r) => setTimeout(r, 240));

    // Find a 3-in-a-row and tumble it. runCascade reads per-reel
    // visibleRows live, so reels with different shapes cascade
    // independently within the same chain.
    const triple = findTriple(stage0);
    if (!triple) return;

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
  },
};
