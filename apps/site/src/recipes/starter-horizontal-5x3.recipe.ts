import { prewarmSpinTextures, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { pickWeighted, tapToSpin, createAssets, GENERIC_SYMBOL_IDS, GENERIC_WEIGHTS, StickerSymbol } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Horizontal starter',
  topic: 'starters',
  tags: ['starter', '5x3', 'cascade', 'multiways', 'hold-and-win', 'horizontal', 'reverse', 'orientation'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// A sideways slot: three strips stacked down the screen, each scrolling along
// X. Clone this when the board should read left-to-right instead of top-down.
//
// Two things change from the classic 5x3 starter, and only two:
//   1. `.orientation('horizontal')` - the strip travels on X, and reels march
//      down Y instead of across X.
//   2. The numbers you hand `symbolSize` / `symbolGap`, because both stay
//      SCREEN space in every orientation. Here the strip advances by the
//      symbol WIDTH (96), and reels are pitched apart by the HEIGHT (72).
//
// Everything else is untouched. `reels(3).visibleCells(5)` means the same
// thing either way - three strips of five cells - and the ColumnTarget[] you
// feed `setResult()` is unchanged, because index space is orientation-neutral.
// Nothing rotates: every symbol still renders upright.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  // Eleven flat stickers, one texture each; the rig does the motion.
  const { textures } = await createAssets().genericSymbols();
  const weights = GENERIC_WEIGHTS;
  // One spin-texture cache per set: the reels spin a baked motion blur of
  // each sticker, no filter per frame, baked up front so the first spin
  // never pays the capture.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  prewarmSpinTextures({ cache, ids: [...GENERIC_SYMBOL_IDS], createSymbol: () => new StickerSymbol({ textures }), width: 96, height: 72 });

  const REELS = 3;  // strips, marching down the screen
  const CELLS = 5;  // cells along each strip, running across the screen

  const reelSet = new ReelSetBuilder()
    .orientation('horizontal')
    .reels(REELS)
    .visibleCells(CELLS)
    .symbolSize(96, 72) // screen width x height. travel eats the width
    .symbolGap(6, 6)    // x separates cells along a strip, y separates strips
    .symbols((r) => {
      for (const id of GENERIC_SYMBOL_IDS) {
        r.register(id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .weights(weights)
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () =>
      Array.from({ length: REELS }, () =>
        Array.from({ length: CELLS }, () => pickWeighted(weights)),
      ),
  });
  return { reelSet };
}
