// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// The classic 5x3 starter with the travel flipped: symbols rise, and the reel
// lands from below. The whole diff is `.direction('reverse')`.
//
// What that does NOT change:
//   - index space. cell 0 is still the top visible cell, `setResult()` still
//     takes the same ColumnTarget[], `getCellBounds(reel, 0)` still returns
//     the top rect.
//   - buffer naming. `bufferStart` is still the slot ABOVE the window, because
//     start/end are geometric, not travel-relative. On a reverse reel the slot
//     symbols arrive through is the one BELOW, so a "next up" teaser goes in
//     `bufferEnd` here. The engine derives that edge itself:
//     `reelSet.getReel(0).axis.feedEdge` reads `'end'` on this set.
//
// For a sideways board see the horizontal starter above; the two knobs compose,
// so `.orientation('horizontal').direction('reverse')` is a right-to-left slot.

const SYMBOLS = [...CARD_DECK, WILD_CARD];

const weights = {
  '7': 20, '8': 20, '9': 20,
  '10': 14, J: 14,
  Q: 10, K: 6, A: 5,
  wild: 3,
};

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleCells(3)
  .symbolSize(90, 90)
  .symbolGap(4, 4)
  .direction('reverse') // the only line that differs from classic-5x3
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
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    ),
};
