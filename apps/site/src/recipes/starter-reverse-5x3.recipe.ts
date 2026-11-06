import { prewarmSpinTextures, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { pickWeighted, tapToSpin, createAssets, GENERIC_SYMBOL_IDS, GENERIC_WEIGHTS, StickerSymbol } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Reverse starter',
  topic: 'starters',
  tags: ['starter', '5x3', 'cascade', 'multiways', 'hold-and-win', 'horizontal', 'reverse', 'orientation'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// The classic 5x3 starter with the travel flipped: symbols rise, and the reel
// lands from below. The whole diff is `.direction('reverse')`.
//
// What that does NOT change:
//   - index space. cell 0 is still the top visible cell, `setResult()` still
//     takes the same ColumnTarget[], `getCellBounds(reel, 0)` still returns
//     the top rect.
//   - buffer naming. `bufferStart` is still the slot ABOVE the window, because
//     start/end are geometric, not travel-relative. On a reverse reel the slot
//     symbols arrive through is the one BELOW, so a "next up" teaser goes in
//     `bufferEnd` here. The engine derives that edge itself:
//     `reelSet.getReel(0).axis.feedEdge` reads `'end'` on this set.
//
// For a sideways board see the horizontal starter above; the two knobs compose,
// so `.orientation('horizontal').direction('reverse')` is a right-to-left slot.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  // Eleven flat stickers, one texture each; the rig does the motion.
  const { textures } = await createAssets().genericSymbols();
  const weights = GENERIC_WEIGHTS;
  // One spin-texture cache per set: the reels spin a baked motion blur of
  // each sticker, no filter per frame, baked up front so the first spin
  // never pays the capture.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  prewarmSpinTextures({ cache, ids: [...GENERIC_SYMBOL_IDS], createSymbol: () => new StickerSymbol({ textures }), width: 90, height: 90 });

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .direction('reverse') // the only line that differs from classic-5x3
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
      Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => pickWeighted(weights)),
      ),
  });
  return { reelSet };
}
