// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const S = 'feature/feature_1'; // scatter
const IDS = [A, B, C, S];

// Two scatters on reels 0 and 2 — anticipation holds reels 3 and 4.
const GRID = [
  [S, A, B],
  [A, B, C],
  [B, S, A],
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

// Longer anticipationDelay so the "hold" on reels 3+4 is clearly visible.
reelSet.speed.addProfile('demo', { ...SpeedPresets.NORMAL, anticipationDelay: 1800 });
reelSet.setSpeed('demo');

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 220));
    reelSet.setAnticipation([3, 4]);
    reelSet.setResult(GRID);
    await p;
  },
};
