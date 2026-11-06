import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Staggered nudge',
  topic: 'nudge',
  tags: ['nudge', 'stagger', 'spotlight', 'big-symbols', 'abort', 'skip', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// STAGGER NUDGE pattern.
//
// Promise.all with per-call `startDelay` produces a wave effect: every
// reel runs its own tween concurrently, but each starts at a different
// time. Cleaner than a sequential loop (each reel doesn't have to wait
// for the previous to fully land), more visible than parallel (reels
// kick off in sequence so the eye can follow the wave).
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const SYMBOLS = [...CARD_DECK, WILD_CARD];
  const FILLER = ['7', '8', '9', '10', 'J'];
  const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
  const col3 = () => [filler(), filler(), filler()];

  const NUDGE_COLS = [0, 1, 2, 3, 4];
  const NUDGE_DURATION = 520;
  const STAGGER_MS = 90;

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(72, 72)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const sym of SYMBOLS) {
        r.register(sym.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const p = reelSet.spin();
      await new Promise((resolve) => setTimeout(resolve, 220));
      reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
      await p;
      await new Promise((resolve) => setTimeout(resolve, 320));

      // All five reels dispatch synchronously inside Promise.all; each one's
      // tween is deferred by `startDelay`. Total wall time:
      //   startDelay of last reel + duration = 4*90 + 520 = 880ms.
      // (Versus 5 * 520 = 2600ms for sequential or 520ms for fully parallel.)
      await Promise.all(
        NUDGE_COLS.map((reel, i) =>
          reelSet.nudge(reel, {
            distance: 1,
            direction: 'forward',
            incoming: ['wild'],
            duration: NUDGE_DURATION,
            startDelay: i * STAGGER_MS,
          }),
        ),
      );
    },
  });
  return { reelSet };
}
