// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Per-reel static shape — a 3-5-5-5-3 pyramid. Reels can have different
// row counts at build time. Cell width is uniform across reels; the
// shorter outer reels are vertically centered by default (`reelAnchor: 'center'`).

const FILLER = ['round/round_1', 'round/round_2', 'round/round_3', 'royal/royal_1', 'royal/royal_2'];
const VISIBLE = [3, 5, 5, 5, 3];
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(VISIBLE.length)
  .visibleRowsPerReel(VISIBLE)
  .reelAnchor('center')
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of FILLER) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 18, 'round/round_2': 18, 'round/round_3': 18,
    'royal/royal_1': 12, 'royal/royal_2': 12,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    VISIBLE.map((rows) =>
      Array.from({ length: rows }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    ),
};
