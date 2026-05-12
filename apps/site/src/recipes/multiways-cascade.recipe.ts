// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, runCascade

// MultiWays + cascade tumble — proper ways-style winner removal.
//
// A "ways" win on a multiways slot: a symbol appears on N consecutive
// reels starting from reel 0. EVERY instance of that symbol on those
// reels is a winner — not just one cell per column, the way a payline
// game would resolve it. So if reel 1 has two Qs and reel 2 has three Qs,
// a Q-ways win pops all five of them.
//
// Visual flow each round:
//   1. setShape(rowsPerReel) rolls a per-reel row count in [minRows, maxRows].
//   2. reelSet.spin() — classic strip-spin lands the multiways grid.
//   3. Detect a ways win. If found, runCascade pops every winning cell;
//      survivors fall, new symbols drop in from above.
//   4. Repeat until no more ways wins (capped at MAX_CASCADES per round).

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
  // Random fill, then plant the same symbol on reels 0, 1, 2 — with multiple
  // copies on reels that have room — so the ways win removes multiple cells
  // per column, which is the whole point of multiways-style cascading.
  const grid = shape.map((rows) =>
    Array.from({ length: rows }, () => randSymbol()),
  );
  if (Math.random() < 0.7) {
    const target = randSymbol();
    for (let c = 0; c < MIN_WAYS_REELS; c++) {
      const len = grid[c].length;
      // At least one copy at row 0; plant 1-2 more copies at distinct rows
      // when the reel has room.
      const positions = new Set([0]);
      const extraCount = len >= 4 ? 2 : len >= 3 ? 1 : 0;
      while (positions.size < 1 + extraCount) {
        positions.add(Math.floor(Math.random() * len));
      }
      for (const row of positions) grid[c][row] = target;
    }
  }
  return grid;
}

function findAllWaysWins(grid) {
  // Every symbol whose presence spans the first N consecutive reels
  // (N >= MIN_WAYS_REELS) is a separate ways win. A real multiways game
  // pays them all in the same evaluation — Q-ways and 10-ways can both
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
      for (let row = 0; row < grid[c].length; row++) {
        if (grid[c][row] === win.id) winners.push({ reel: c, row });
      }
    }
  }
  return winners;
}

function applyCascade(grid, winners) {
  // Group winners by reel, then per reel: drop the winning rows, shift
  // survivors down, fill the cleared top slots with new random symbols.
  // Cell count per reel stays the same — multiways shape doesn't change
  // mid-cascade.
  const winnersByReel = new Map();
  for (const w of winners) {
    if (!winnersByReel.has(w.reel)) winnersByReel.set(w.reel, new Set());
    winnersByReel.get(w.reel).add(w.row);
  }
  return grid.map((col, c) => {
    const winRows = winnersByReel.get(c);
    if (!winRows || winRows.size === 0) return [...col];
    const survivors = col.filter((_, row) => !winRows.has(row));
    const newCount = col.length - survivors.length;
    const newSymbols = Array.from({ length: newCount }, () => randSymbol());
    return [...newSymbols, ...survivors];
  });
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
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const shape = randomShape();

    // Round 1 — strip-spin lands the multiways grid (AdjustPhase reshapes
    // between SPIN and STOP).
    const stage0 = buildGridWithGuaranteedWin(shape);
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 120));
    reelSet.setShape(shape);
    reelSet.setResult(stage0);
    await p;
    await new Promise((r) => setTimeout(r, 240));

    // Build the full cascade chain upfront. Each stage is a grid; each
    // stage-N → stage-(N+1) transition has a winners list captured in
    // `winnersByStage`. runCascade reads that list via the `winners`
    // callback below.
    const stages = [stage0];
    const winnersByStage = [];
    let current = stage0;
    while (winnersByStage.length < MAX_CASCADES) {
      const wins = findAllWaysWins(current);
      if (wins.length === 0) break;
      const winners = collectAllWinners(current, wins);
      winnersByStage.push(winners);
      current = applyCascade(current, winners);
      stages.push(current);
    }

    if (winnersByStage.length === 0) return;

    // runCascade walks `stages`; for the stage-N → stage-(N+1) transition
    // it invokes the winners callback with stageIndex = N + 1 (it's the
    // post-increment value of the iteration counter, not the source index).
    // Our winnersByStage[i] holds the winners that produced stages[i+1] from
    // stages[i], so the lookup is `stageIdx - 1`.
    await runCascade(reelSet, stages, {
      winners: (_prev, _next, stageIdx) => winnersByStage[stageIdx - 1] ?? [],
      vanishDuration: 300,
      dropDuration: 420,
      pauseBetween: 160,
    });
  },
};
