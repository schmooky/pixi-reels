import { CARD_DECK, CardSymbol, ReelSetBuilder, SpeedPresets, WILD_CARD } from 'pixi-reels';
import { pickWeighted, tapToSpin } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Classic 5×3 starter',
  topic: 'starters',
  tags: ['starter', '5x3', 'cascade', 'multiways', 'hold-and-win', 'horizontal', 'reverse', 'orientation'],
} as const satisfies RecipeMeta;

// Cards make a clean prototyping canvas. no asset loading, no motion-blur
// strip, scales crisply at any cell size. Swap to SpriteSymbol +
// AnimatedSpriteSymbol when you ship.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const SYMBOLS = [...CARD_DECK, WILD_CARD];

  const weights = {
    '7': 20, '8': 20, '9': 20,
    '10': 14, J: 14,
    Q: 10, K: 6, A: 5,
    wild: 3,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const sym of SYMBOLS) {
        r.register(sym.id, CardSymbol, {
          color: sym.color,
          label: sym.label,
          textColor: sym.textColor,
        });
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
