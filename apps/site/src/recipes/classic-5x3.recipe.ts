import { prewarmSpinTextures, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { pickWeighted, tapToSpin, createAssets, GENERIC_SYMBOL_IDS, GENERIC_WEIGHTS, StickerSymbol } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Classic 5×3 starter',
  topic: 'starters',
  tags: ['starter', '5x3', 'cascade', 'multiways', 'hold-and-win', 'horizontal', 'reverse', 'orientation'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// The generic set: flat stickers with the studio motion on them, the
// closest thing to a shipped symbol that needs no sheet and no skeleton.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  // Eleven flat stickers, one texture each, bare on the well; the rig does the motion.
  const { textures } = await createAssets().genericSymbols();
  const weights = GENERIC_WEIGHTS;
  // One spin-texture cache per set: the reels spin a baked motion blur of
  // each sticker, no filter per frame, baked up front so the first spin
  // never pays the capture.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  prewarmSpinTextures({ cache, ids: [...GENERIC_SYMBOL_IDS], createSymbol: () => new StickerSymbol({ textures, tile: false }), width: 90, height: 90 });

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of GENERIC_SYMBOL_IDS) {
        r.register(id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures, tile: false }), cache, blurRampMs: 140 });
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
      Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => pickWeighted(weights)),
      ),
  });
  return { reelSet };
}
