// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];

const GRID = [
  [SEVEN, A, B],
  [C, SEVEN, A],
  [B, C, SEVEN],
  [A, SEVEN, B],
  [C, A, SEVEN],
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
  onSpin: async () => {
    const p = reelSet.spin();
    reelSet.setResult(GRID);
    await new Promise(r => setTimeout(r, 560));
    reelSet.skip();
    await p;
  },
};
