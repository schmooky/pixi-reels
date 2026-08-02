// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// A sideways slot: three strips stacked down the screen, each scrolling along
// X. Clone this when the board should read left-to-right instead of top-down.
//
// Two things change from the classic 5x3 starter, and only two:
//   1. `.orientation('horizontal')` - the strip travels on X, and reels march
//      down Y instead of across X.
//   2. The numbers you hand `symbolSize` / `symbolGap`, because both stay
//      SCREEN space in every orientation. Here the strip advances by the
//      symbol WIDTH (96), and reels are pitched apart by the HEIGHT (72).
//
// Everything else is untouched. `reels(3).visibleCells(5)` means the same
// thing either way - three strips of five cells - and the ColumnTarget[] you
// feed `setResult()` is unchanged, because index space is orientation-neutral.
// Nothing rotates: every card still renders upright.

const SYMBOLS = [...CARD_DECK, WILD_CARD];

const weights = {
  '7': 20, '8': 20, '9': 20,
  '10': 14, J: 14,
  Q: 10, K: 6, A: 5,
  wild: 3,
};

const REELS = 3;  // strips, marching down the screen
const CELLS = 5;  // cells along each strip, running across the screen

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(96, 72) // screen width x height. travel eats the width
  .symbolGap(6, 6)    // x separates cells along a strip, y separates strips
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .weights(weights)
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => pickWeighted(weights)),
    ),
};
