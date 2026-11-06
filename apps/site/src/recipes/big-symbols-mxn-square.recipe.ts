import { CARD_DECK, ReelSetBuilder, SharedRectMaskStrategy, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Square big symbols',
  topic: 'big-symbols',
  tags: ['big-symbols', 'multiways', 'pyramid', 'spine', 'geometry', 'sticky-wild', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// SQUARE big symbol. 2x2. The shape's defining property: equal width and
// height, so the symbol scales without distorting the grid's aspect ratio.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const SQUARE = { id: 'square', color: 0xa3e4d7, label: '2×2', textColor: 0x0e5345, w: 2, h: 2 };
  const set = await createAssets().genericSymbols();
  // The block wears a framed sticker; the deck's ids map onto the set.
  const { frames } = set;
  const textures = { ...set.textures, [SQUARE.id]: set.textures.H4 };
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
      registry.register(SQUARE.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures, frames, span: { reels: SQUARE.w, cells: SQUARE.h } }), cache, blurRampMs: 140 });
    })
    .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
    .symbolData({ [SQUARE.id]: { weight: 0, zIndex: 5, size: { reels: SQUARE.w, cells: SQUARE.h } } })
    // Big symbols are large (a 2x2 anchor is ~2x cell size);
    // the default 56px landing bounce overshoots into adjacent cells and
    // reads as a broken landing. Zero the bounce so the anchor lands
    // flush on grid.
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
      // Always plant the square so the demo always shows the mechanic.
      const reel = Math.floor(Math.random() * (REELS - SQUARE.w + 1));
      const cell = Math.floor(Math.random() * (ROWS - SQUARE.h + 1));
      grid[reel][cell] = SQUARE.id;
      return grid;
    },
  });
  return { reelSet };
}
