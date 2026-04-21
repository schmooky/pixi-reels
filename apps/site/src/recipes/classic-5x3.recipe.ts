// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2',
  'square/square_1', 'wild/wild_1',
];

const weights = {
  'round/round_1': 20, 'round/round_2': 20, 'round/round_3': 20,
  'royal/royal_1': 14, 'royal/royal_2': 14,
  'square/square_1': 10, 'wild/wild_1': 3,
};

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleSymbols(3)
  .symbolSize(90, 90)
  .symbolGap(4, 4)
  .symbols(r => {
    for (const id of IDS) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
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
      Array.from({ length: 3 }, () => pickWeighted(weights))
    ),
};
