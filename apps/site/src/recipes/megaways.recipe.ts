// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Megaways — per-spin row variation. Each reel can land on a different
// number of rows in the range [minRows, maxRows]. The reel pixel height is
// fixed; cell height per reel is derived (`reelPixelHeight / visibleRows[i]`).
// `setShape(rowsPerReel)` is called between `spin()` and `setResult()`;
// AdjustPhase reshapes the reels before the stop sequence.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'royal/royal_2', 'wild/wild_1'];
const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS; // ~68
const GAP = 2;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .megaways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  // Reshape tween: every cell stretches/shrinks from its old size to the
  // new one over 350ms with a back-out ease. Set adjustDuration(0) for an
  // instant snap if you don't want the animation.
  .adjustDuration(350)
  .adjustEase('back.out(1.2)')
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of FILLER) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 18, 'round/round_2': 18,
    'royal/royal_1': 12, 'royal/royal_2': 12,
    'wild/wild_1': 3,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    // Random shape this spin. Tell the engine BEFORE setResult.
    const shape = Array.from({ length: REELS }, () =>
      MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
    );
    reelSet.setShape(shape);
    return shape.map((rows) =>
      Array.from({ length: rows }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
  },
};
