// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted,
//           runCascade, tumbleToGrid (cascade helpers)

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const X = 'feature/feature_1'; // the winner that vanishes
const IDS = [A, B, C, X];
const REELS = 4, ROWS = 3, SIZE = 90;

const BEFORE = [
  [X, A, B],
  [X, C, A],
  [X, B, C],
  [A, C, X],
];
const AFTER = [
  [C, A, B],
  [B, C, A],
  [A, B, C],
  [B, A, C],
];

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    // Land BEFORE via a normal spin.
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(BEFORE);
    await p;
    await new Promise(r => setTimeout(r, 300));

    // runCascade: stage 0 = BEFORE (already showing), stage 1 = AFTER.
    // winners() identifies the X cells that should vanish before the drop.
    await runCascade(reelSet, [BEFORE, AFTER], {
      winners: () => BEFORE.flatMap((col, reel) =>
        col.map((sym, row) => sym === X ? { reel, row } : null).filter(Boolean)
      ),
      vanishDuration: 320,
      dropDuration: 440,
      pauseBetween: 120,
    });
  },
};
