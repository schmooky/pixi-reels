// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
  'royal/royal_1', 'royal/royal_2', 'square/square_1', 'square/square_2',
];

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
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => IDS[Math.floor(Math.random() * IDS.length)])
    ),
};
