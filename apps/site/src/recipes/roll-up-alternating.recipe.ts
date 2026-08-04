// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// Mixed direction per reel: odd columns spin up, even columns spin down.
// `.directionPerReel([...])` sets each reel's travel independently - a woven,
// alternating-column look from one build call. Each reel still lands the exact
// server frame because its StopSequencer feeds from its own edge.

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
  .directionPerReel(['forward', 'reverse', 'forward', 'reverse', 'forward'])
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
