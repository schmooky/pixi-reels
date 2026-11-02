import {
  prewarmSpinTextures,
  ReelSetBuilder,
  SpeedPresets,
  SpinTextureCache,
  StaticSpinSymbol,
} from 'pixi-reels';
import { SpineReelSymbol } from 'pixi-reels/spine';
import { buildSpineMap, pickWeighted, createAssets, tapToSpin } from '@pixi-reels/kit';
import type { GeneratedSpineName, RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Spin static, not Spine',
  topic: 'symbols',
  tags: ['symbols', 'reveal', 'mystery', 'pools', 'buffers', 'weights', 'layering', 'static-spin', 'motion-blur', 'spine', 'horizontal', 'orientation'],
  height: 340,
  needs: ['spine:generated'],
} as const satisfies RecipeMeta;

// "Spin static, not Spine." At rest every cell is a live Spine skeleton
// (idle loops, landing animations). The moment the reels spin, each cell
// swaps to a cached snapshot texture and the skeleton is DEACTIVATED -
// no Spine state ticks while spinning, and cells recycling mid-spin never
// instantiate a skeleton at all. On land the skeletons come back and play
// their landing animation.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const assets = createAssets();
  await assets.spineSet("generated");

  const SIZE = 140; // the generated skeletons' authored frame size - render 1:1
  const SPINE_MAP: Record<string, GeneratedSpineName> = {
    '9': 'low_a',
    '10': 'low_k',
    J: 'low_q',
    Q: 'low_j',
    K: 'mid_1',
    A: 'high_1',
    wild: 'wild',
  };
  const IDS = Object.keys(SPINE_MAP);
  const spineMap = buildSpineMap(SPINE_MAP);

  const weights = { '9': 20, '10': 20, J: 16, Q: 12, K: 8, A: 6, wild: 3 };

  const cache = new SpinTextureCache({ renderer: app.renderer });
  const createInner = () =>
    new SpineReelSymbol({ spineMap, autoPlayLanding: true });

  // One skeleton bakes every id: it re-activates per id during the prewarm.
  prewarmSpinTextures({
    cache,
    ids: IDS,
    createSymbol: createInner,
    width: SIZE,
    height: SIZE,
  });

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(SIZE, SIZE)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of IDS) {
        r.register(id, StaticSpinSymbol, {
          createInner,
          cache,
          blurRampMs: 160,
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
