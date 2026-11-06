import { CARD_DECK, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Per-reel shape (pyramid)',
  topic: 'big-symbols',
  tags: ['big-symbols', 'multiways', 'pyramid', 'spine', 'geometry', 'sticky-wild', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// Per-reel static shape. a 3-5-5-5-3 pyramid. Reels can have different
// cell counts at build time. Cell width is uniform across reels; the
// shorter outer reels are vertically centered by default (`reelAnchor: 'center'`).
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY. see /recipes/card-symbol-debug/.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const VISIBLE = [3, 5, 5, 5, 3];
  const SIZE = 80;
  const GAP = 4;

  const reelSet = new ReelSetBuilder()
    .reels(VISIBLE.length)
    .visibleCellsPerReel(VISIBLE)
    .reelAnchor('center')
    .symbolSize(SIZE, SIZE)
    .symbolGap(GAP, GAP)
    .symbols((registry) => {
      for (const card of CARD_DECK) {
        registry.register(card.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () =>
      VISIBLE.map((cells) =>
        Array.from({ length: cells }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
      ),
  });
  return { reelSet };
}
