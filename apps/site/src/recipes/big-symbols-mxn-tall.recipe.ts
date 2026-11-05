import {
  CARD_DECK,
  ReelSetBuilder,
  SharedRectMaskStrategy,
  SpeedPresets,
} from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'MxN big symbols. every shape',
  topic: 'big-symbols',
  tags: ['big-symbols', 'multiways', 'pyramid', 'spine', 'geometry', 'sticky-wild', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// TALL big symbol. 1×3. One column wide, three cells tall. Reads as a
// "stacked" symbol: think gold-bar towers, totems, or vertical wild
// columns that span the visible area without occupying neighbouring reels.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const TALL = { id: 'tall', color: 0xffb86b, label: 'TALL', textColor: 0x6b3e0a, w: 1, h: 3 };
  const set = await createAssets().genericSymbols();
  // The block wears a framed sticker; the deck's ids map onto the set.
  const { frames } = set;
  const textures = { ...set.textures, [TALL.id]: set.textures.H1 };
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
        registry.register(card.id, StickerSymbol, { textures });
      }
      registry.register(TALL.id, StickerSymbol, { textures, frames, span: { reels: TALL.w, cells: TALL.h } });
    })
    .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
    .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { reels: TALL.w, cells: TALL.h } } })
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
      const reel = Math.floor(Math.random() * (REELS - TALL.w + 1));
      const cell = Math.floor(Math.random() * (ROWS - TALL.h + 1));
      grid[reel][cell] = TALL.id;
      return grid;
    },
  });
  return { reelSet };
}
