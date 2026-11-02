import { ReelSetBuilder, SpeedPresets } from 'pixi-reels';
import { BlurSpriteSymbol } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';

export const meta = {
  title: 'Texture atlas symbols',
  topic: 'symbols',
  tags: ['symbols', 'reveal', 'mystery', 'pools', 'buffers', 'weights', 'layering', 'static-spin', 'motion-blur', 'spine', 'horizontal', 'orientation'],
  needs: ['prototype-atlas'],
} as const satisfies RecipeMeta;

export default async function recipe({ app, assets }: RecipeContext): Promise<RecipeResult> {
  const { textures, blurTextures } = await assets.prototypeAtlas();

  const IDS = [
    'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
    'royal/royal_1', 'royal/royal_2', 'square/square_1', 'square/square_2',
  ];

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols(r => {
      for (const id of IDS) {
        r.register(id, BlurSpriteSymbol, { textures, blurTextures });
      }
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  return {
    reelSet,
    nextResult: () =>
      Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => IDS[Math.floor(Math.random() * IDS.length)])
      ),
  };
}
