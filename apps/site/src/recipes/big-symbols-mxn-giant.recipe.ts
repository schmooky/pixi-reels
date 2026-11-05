import { CARD_DECK, ReelSetBuilder, SharedRectMaskStrategy, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'MxN big symbols. every shape',
  topic: 'big-symbols',
  tags: ['big-symbols', 'multiways', 'pyramid', 'spine', 'geometry', 'sticky-wild', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// GIANT big symbol. 3×3. Mid-board feature anchor: jackpot reveal panels,
// "free spins triggered" overlays, large character art. Eats nine cells out
// of a 6×5 grid, so weight 0 and place sparingly via the server.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const GIANT = { id: 'giant', color: 0xfff3a0, label: 'GIANT', textColor: 0x6b5400, w: 3, h: 3 };
  const set = await createAssets().genericSymbols();
  // The block wears a framed sticker; the deck's ids map onto the set.
  const { frames } = set;
  const textures = { ...set.textures, [GIANT.id]: set.textures.H3 };
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
      registry.register(GIANT.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures, frames, span: { reels: GIANT.w, cells: GIANT.h } }), cache, blurRampMs: 140 });
    })
    .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
    .symbolData({ [GIANT.id]: { weight: 0, zIndex: 5, size: { reels: GIANT.w, cells: GIANT.h } } })
    // A 3x3 anchor spans ~3x a normal cell, so
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
      const reel = Math.floor(Math.random() * (REELS - GIANT.w + 1));
      const cell = Math.floor(Math.random() * (ROWS - GIANT.h + 1));
      grid[reel][cell] = GIANT.id;
      return grid;
    },
  });
  return { reelSet };
}
