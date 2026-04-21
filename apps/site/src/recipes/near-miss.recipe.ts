// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const S = 'feature/feature_1'; // scatter
const IDS = [A, B, C, S];

// Two scatters on reels 0 and 2; reel 4 has none — classic near-miss.
const GRID = [
  [S, A, B],
  [B, A, C],
  [A, S, B],
  [C, A, B],
  [B, C, A],
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
    await new Promise(r => setTimeout(r, 220));
    reelSet.setAnticipation([4]);
    reelSet.setResult(GRID);
    await p;
  },
};
