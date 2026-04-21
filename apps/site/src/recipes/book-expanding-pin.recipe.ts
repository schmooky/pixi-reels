// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Book-style expanding symbol (Book of Dead / Book of Ra mechanic).
//
// At feature start, ONE symbol class is chosen as "the expanding symbol".
// During each feature spin: any reel containing at least one instance of that
// symbol has every visible row of that reel filled with it before the win
// evaluation runs.
//
// Different from an expanding wild:
//   - Expanding wild is per-wild-cell
//   - Book-style is per-symbol-class, per-reel, and the symbol isn't a wild
//
// We pin with `turns: 'eval'` so the reel flood is cleared at next spin:start.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const EXPANDING = 'wild/wild_1'; // In a real game this is chosen at feature entry
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, EXPANDING]) {
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

// ── Book-style expansion ─────────────────────────────────────────────────
// For every reel that contains the chosen symbol on any visible row,
// fill every other row of that reel with the same symbol — for evaluation
// only. Pins auto-clear at next spin:start.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    if (!symbols[c].includes(EXPANDING)) continue;
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] !== EXPANDING) {
        reelSet.pin(c, r, EXPANDING, { turns: 'eval' });
      }
    }
  }
});

// Scripted arrivals so the visual payoff is predictable.
const arrivals = [
  { cols: [1], rows: [1] },
  { cols: [2, 4], rows: [0, 2] },
  { cols: [0, 3], rows: [1, 1] },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const arr = arrivals[spinCount % arrivals.length];
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    for (let i = 0; i < arr.cols.length; i++) {
      grid[arr.cols[i]][arr.rows[i]] = EXPANDING;
    }
    spinCount++;
    return grid;
  },
};
