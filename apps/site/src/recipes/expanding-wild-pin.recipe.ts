// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Expanding wild — when a wild lands, fill its entire column with wild for
// this spin's evaluation only. We use `turns: 'eval'` pins, which are
// cleared automatically at the next spin:start.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, WILD]) {
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

// ── Expand wilds on land ─────────────────────────────────────────────────
// For every reel that has a wild somewhere in its visible rows, pin all
// other rows of that reel with WILD for this spin's evaluation only.
//
// `turns: 'eval'` means: apply now, expire at the NEXT spin:start.
// The pins are cleared automatically — no manual cleanup needed.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    const hasWild = symbols[c].includes(WILD);
    if (!hasWild) continue;
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] !== WILD) {
        reelSet.pin(c, r, WILD, { turns: 'eval' });
      }
    }
  }
});

// Scripted: alternate between a wild landing on reel 2 and reel 3.
const wildColumn = [2, 3];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const col = wildColumn[spinCount % wildColumn.length];
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    // Place one wild in the middle row of the chosen column
    grid[col][1] = WILD;
    spinCount++;
    return grid;
  },
};
