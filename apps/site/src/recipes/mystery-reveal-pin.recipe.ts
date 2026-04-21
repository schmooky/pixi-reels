// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Mystery symbol (reveal-to-same-class) using CellPin with `turns: 'eval'`.
//
// When mystery symbols land, we pick one random non-mystery class and pin
// it at each mystery cell with `turns: 'eval'`. The pins are cleared
// automatically at the next spin:start — no manual cleanup.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const MYSTERY = 'wild/wild_1'; // sprite stands in for a "?" mystery icon
const REVEAL_CANDIDATES = FILLER; // mystery can reveal to any filler
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, MYSTERY]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 22,
    'round/round_2': 22,
    'royal/royal_1': 18,
    'square/square_1': 18,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Mystery reveal on land ───────────────────────────────────────────────
// After reels land, if any cell is a mystery symbol, pick ONE random
// filler class and pin it at every mystery cell with eval lifetime.
// The pins override the visible symbols; the next spin clears them.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  const mysteryCells = [];
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === MYSTERY) mysteryCells.push({ col: c, row: r });
    }
  }
  if (mysteryCells.length === 0) return;

  const reveal = REVEAL_CANDIDATES[Math.floor(Math.random() * REVEAL_CANDIDATES.length)];
  for (const cell of mysteryCells) {
    reelSet.pin(cell.col, cell.row, reveal, { turns: 'eval' });
  }
});

// Scripted: every third spin, a few mystery cells land in a row.
const scripts = [
  { mysteries: [] },
  { mysteries: [] },
  { mysteries: [{ c: 0, r: 1 }, { c: 2, r: 1 }, { c: 4, r: 1 }] },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const script = scripts[spinCount % scripts.length];
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    for (const m of script.mysteries) grid[m.c][m.r] = MYSTERY;
    spinCount++;
    return grid;
  },
};
