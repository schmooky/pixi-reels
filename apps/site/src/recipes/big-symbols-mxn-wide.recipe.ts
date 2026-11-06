import { CARD_DECK, ReelSetBuilder, SharedRectMaskStrategy, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Wide big symbols',
  topic: 'big-symbols',
  tags: ['big-symbols', 'multiways', 'pyramid', 'spine', 'geometry', 'sticky-wild', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// WIDE big symbol. 2×4. Two columns wide, four cells tall. a banner-shaped
// block. Useful for "feature triggered" splash panels that need to span
// adjacent reels but don't want to dominate the whole board the way a 3×3
// giant does. Demands a tall enough grid (cells >= 4).
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const WIDE = { id: 'wide', color: 0xf5b7b1, label: 'WIDE', textColor: 0x641e16, w: 2, h: 4 };
  const set = await createAssets().genericSymbols();
  // The block wears a framed sticker; the deck's ids map onto the set.
  const { frames } = set;
  const textures = { ...set.textures, [WIDE.id]: set.textures.H3 };
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const REELS = 6;
  const ROWS = 5;
  const SIZE = 70;
  const GAP = 3;

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleCells(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(GAP, GAP)
    .maskStrategy(new SharedRectMaskStrategy())
    .symbols((registry) => {
      for (const card of CARD_DECK) {
        registry.register(card.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
      registry.register(WIDE.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures, frames, span: { reels: WIDE.w, cells: WIDE.h } }), cache, blurRampMs: 140 });
    })
    .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
    .symbolData({ [WIDE.id]: { weight: 0, zIndex: 5, size: { reels: WIDE.w, cells: WIDE.h } } })
    // Big symbols are massive; the default 56px landing bounce
    // overshoots into adjacent cells and reads as a broken landing.
    // Zero the bounce so the anchor lands flush on grid.
    .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
    .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () => {
      const grid = Array.from({ length: REELS }, () =>
        Array.from({ length: ROWS }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
      );
      const reel = Math.floor(Math.random() * (REELS - WIDE.w + 1));
      const cell = Math.floor(Math.random() * (ROWS - WIDE.h + 1));
      grid[reel][cell] = WIDE.id;
      return grid;
    },
  });
  return { reelSet };
}
