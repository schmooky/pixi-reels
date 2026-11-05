import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD } from 'pixi-reels';
import { pickWeighted, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Horizontal banner',
  topic: 'orientation-and-direction',
  tags: ['horizontal', 'orientation', 'direction', 'reverse', 'roll-up', 'banner', 'ways', 'axis'],
  height: 200,
} as const satisfies RecipeMeta;

// A horizontal "paying symbols this round" banner: one reel whose cells lie
// along X and scroll sideways. In v2 this is just orientation('horizontal') on
// the normal builder - same spin lifecycle, events, and speed profiles as a
// vertical set. It replaces the old standalone HorizontalReel.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  const SYMBOLS = [...CARD_DECK, WILD_CARD];

  const weights = {
    '7': 20, '8': 20, '9': 20,
    '10': 14, J: 14,
    Q: 10, K: 6, A: 5,
    wild: 6,
  };

  const reelSet = new ReelSetBuilder()
    .orientation('horizontal')
    .reels(1)
    .visibleCells(5) // 5 cells along the strip
    .symbolSize(90, 90)
    .symbolGap(6, 0)
    .symbols((r) => {
      for (const sym of SYMBOLS) {
        r.register(sym.id, StickerSymbol, { textures });
      }
    })
    .weights(weights)
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () => [Array.from({ length: 5 }, () => pickWeighted(weights))],
  });
  return { reelSet };
}
