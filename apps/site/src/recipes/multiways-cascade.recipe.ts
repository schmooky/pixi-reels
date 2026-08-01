// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app

// MultiWays + cascade tumble. ways-style winner removal.
//
// A "ways" win on a multiways slot: a symbol appears on N consecutive
// reels starting from reel 0. EVERY instance of that symbol on those
// reels is a winner. not just one cell per column, the way a payline
// game would resolve it. So if reel 1 has two Qs and reel 2 has three Qs,
// a Q-ways win pops all five of them.
//
// Visual flow each round:
//   1. setShape(rowsPerReel) rolls a per-reel cell count in [minCells, maxCells].
//   2. reelSet.spin({ mode: 'standard' }). classic strip-spin lands the multiways grid.
//   3. reelSet.runCascade({ detectWinners, nextGrid }) pops every winning cell;
//      survivors fall, new symbols drop in from above. Loops until no more
//      ways wins (capped at MAX_CASCADES per round).

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 5;
const REEL_PIXEL_HEIGHT = 360;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 4;

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const MIN_WAYS_REELS = 3;
const MAX_CASCADES = 4;

function randSymbol() {
  return IDS[Math.floor(Math.random() * IDS.length)];
}

function randomShape() {
  return Array.from({ length: REELS }, () =>
    MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
  );
}

function buildGridWithGuaranteedWin(shape) {
  // Random fill, then plant the same symbol on reels 0, 1, 2. with multiple
  // copies on reels that have room. so the ways win removes multiple cells
  // per column, which is the whole point of multiways-style cascading.
  const grid = shape.map((cells) =>
    Array.from({ length: cells }, () => randSymbol()),
  );
  if (Math.random() < 0.7) {
    const target = randSymbol();
    for (let c = 0; c < MIN_WAYS_REELS; c++) {
      const len = grid[c].length;
      const positions = new Set([0]);
      const extraCount = len >= 4 ? 2 : len >= 3 ? 1 : 0;
      while (positions.size < 1 + extraCount) {
        positions.add(Math.floor(Math.random() * len));
      }
      for (const cell of positions) grid[c][cell] = target;
    }
  }
  return grid;
}

function findAllWaysWins(grid) {
  // Every symbol whose presence spans the first N consecutive reels
  // (N >= MIN_WAYS_REELS) is a separate ways win. A real multiways game
  // pays them all in the same evaluation. Q-ways and 10-ways can both
  // hit simultaneously and both contribute winners to the same cascade.
  const wins = [];
  for (const id of IDS) {
    let reelCount = 0;
    for (let c = 0; c < grid.length; c++) {
      if (grid[c].includes(id)) reelCount++;
      else break;
    }
    if (reelCount >= MIN_WAYS_REELS) wins.push({ id, reelCount });
  }
  return wins;
}

function collectAllWinners(grid, wins) {
  // For every winning symbol, every instance on that symbol's winning
  // reels is a winner. Cells can't double-count: a cell shows one id,
  // so it appears in at most one win's winner list.
  const winners = [];
  for (const win of wins) {
    for (let c = 0; c < win.reelCount; c++) {
      for (let cell = 0; cell < grid[c].length; cell++) {
        if (grid[c][cell] === win.id) winners.push({ reel: c, cell });
      }
    }
  }
  return winners;
}

function applyCascade(grid, winners) {
  // Per-reel gravity: drop winning cells, shift survivors down, fill the
  // cleared top slots with new random symbols. Cell count per reel stays
  // the same. multiways shape doesn't change mid-cascade.
  const winnersByReel = new Map();
  for (const w of winners) {
    if (!winnersByReel.has(w.reel)) winnersByReel.set(w.reel, new Set());
    winnersByReel.get(w.reel).add(w.cell);
  }
  return grid.map((reel, c) => {
    const winRows = winnersByReel.get(c);
    if (!winRows || winRows.size === 0) return [...reel];
    const survivors = reel.filter((_, cell) => !winRows.has(cell));
    const newCount = reel.length - survivors.length;
    const newSymbols = Array.from({ length: newCount }, () => randSymbol());
    return [...newSymbols, ...survivors];
  });
}

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minCells: MIN_ROWS, maxCells: MAX_ROWS, reelExtent: REEL_PIXEL_HEIGHT })
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
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 0, ease: 'none', cellStagger: 0 },              // not used. refill skips fall
    dropIn: { duration: 280, ease: 'back.out(1.4)', cellStagger: 0, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();

// Multiways slots build at `maxCells` until the first `setShape` + spin
// commits a jagged shape. On page load that looks like a uniform 6x5.
// not great for a recipe whose whole point is per-reel cell variation.
// Run a silent initial spin+skip with a fresh random shape so the
// landing grid the user first sees already shows the jagged silhouette.
const initialShape = randomShape();
const initialGrid = initialShape.map((cells) =>
  Array.from({ length: cells }, () => randSymbol()),
);
{
  const p = reelSet.spin({ mode: 'standard' });
  reelSet.setShape(initialShape);
  reelSet.setResult(initialGrid.map((visible) => ({ visible })));
  reelSet.skipSpin();
  await p;
}

return {
  reelSet,
  onSpin: async () => {
    const shape = randomShape();

    // Round 1. strip-spin lands the multiways grid (AdjustPhase reshapes
    // between SPIN and STOP).
    const stage0 = buildGridWithGuaranteedWin(shape);
    const p = reelSet.spin({ mode: 'standard' });
    await new Promise((r) => setTimeout(r, 80));
    reelSet.setShape(shape);
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 120));

    // Cascade chain. `reelSet.runCascade` owns detect → destroy → pause
    // → refill. We supply the game rules via the two callbacks. The
    // `detectWinners` callback re-evaluates ways wins on the post-refill
    // grid each iteration; when no more ways wins exist, the chain ends.
    let cascadeCount = 0;
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: (grid) => {
        if (cascadeCount >= MAX_CASCADES) return [];
        const wins = findAllWaysWins(grid);
        if (wins.length === 0) return [];
        return collectAllWinners(grid, wins);
      },
      nextGrid: (prev, winners) => {
        cascadeCount += 1;
        return applyCascade(prev, [...winners]);
      },
      pauseAfterDestroyMs: 60,
    });
  },
};
