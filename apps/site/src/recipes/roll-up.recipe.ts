// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// Roll-up: every reel spins UPWARD instead of down. Same engine, same math,
// same events, same landing bounce - the only change is `.direction('reverse')`.
// New in v2: direction is a property of the axis, not the sign of a delta, so
// the whole spin lifecycle just runs the other way.

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
  .direction('reverse') // <- roll-up: symbols rise from below and land at the top
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
