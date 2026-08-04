// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// A horizontal "paying symbols this round" banner: one reel whose cells lie
// along X and scroll sideways. In v2 this is just orientation('horizontal') on
// the normal builder - same spin lifecycle, events, and speed profiles as a
// vertical set. It replaces the old standalone HorizontalReel.

const SYMBOLS = [...CARD_DECK, WILD_CARD];

const weights = {
  '7': 20, '8': 20, '9': 20,
  '10': 14, J: 14,
  Q: 10, K: 6, A: 5,
  wild: 6,
};

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(1)
  .visibleCells(5) // 5 cells along the strip
  .symbolSize(90, 90)
  .symbolGap(6, 0)
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
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => [Array.from({ length: 5 }, () => pickWeighted(weights))],
};
