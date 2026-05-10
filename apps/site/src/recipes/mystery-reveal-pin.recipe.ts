// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, pickWeighted
//
// Mystery symbol (reveal-to-same-class) using CellPin with `turns: 'eval'`.
//
// When mystery symbols land, we pick one random non-mystery class and pin
// it at each mystery cell with `turns: 'eval'`. The pins are cleared
// automatically at the next spin:start — no manual cleanup.

const FILLER = ['7', '8', '10', 'Q'];
const MYSTERY = 'mystery';
const REVEAL_CANDIDATES = FILLER; // mystery can reveal to any filler
const COLS = 5, ROWS = 3, SIZE = 90;

// Dark slate card with a "?" label so the mystery cell is unmistakable.
const MYSTERY_CARD = { id: MYSTERY, color: 0x34495e, label: '?', textColor: 0xffffff };

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, MYSTERY_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights({
    '7': 22,
    '8': 22,
    '10': 18,
    Q: 18,
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
