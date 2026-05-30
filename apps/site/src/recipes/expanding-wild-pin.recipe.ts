// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, pickWeighted
//
// Expanding wild. when a wild lands, fill its entire column with wild
// and keep the expansion for N spins. Each column-fill pin has `turns: 3`,
// so the expanded column sticks around for three more spins before the
// engine auto-expires the fill.

const FILLER = ['7', '8', '10', 'Q'];
const WILD = WILD_CARD.id;
const COLS = 5, ROWS = 3, SIZE = 90;
const STICKY_TURNS = 3;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
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

// ── Expand wilds on land, persist for N spins ───────────────────────────
// For every reel that has a wild somewhere in its visible rows, pin every
// row of that reel with WILD for STICKY_TURNS spins. The engine decrements
// `turns` after each spin:allLanded and auto-expires pins at zero.
//
// Pinning the wild's own cell too means the "original" wild also benefits
// from the sticky duration, so the entire column visibly stays wild until
// all pins expire together.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    const hasWild = symbols[c].includes(WILD);
    if (!hasWild) continue;
    for (let r = 0; r < symbols[c].length; r++) {
      if (!reelSet.getPin(c, r)) {
        reelSet.pin(c, r, WILD, { turns: STICKY_TURNS });
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
