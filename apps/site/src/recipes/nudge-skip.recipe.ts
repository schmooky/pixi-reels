import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Skip an in-flight nudge',
  topic: 'nudge',
  tags: ['nudge', 'stagger', 'spotlight', 'big-symbols', 'abort', 'skip', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// SKIP NUDGE pattern.
//
// The handler runs a deliberately slow 1500ms-per-reel sequential nudge.
// While it's mid-tween the spin button morphs into a skip button. one
// tap calls `reelSet.skipNudge()` which fast-forwards the active tween
// to its landed state. The `nudge()` promise still resolves normally,
// so the consumer's success path (win re-detect, spotlight, whatever)
// runs unchanged. only the animation got cut short.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const SYMBOLS = [...CARD_DECK, WILD_CARD];
  const FILLER = ['7', '8', '9', '10', 'J'];
  const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
  const col3 = () => [filler(), filler(), filler()];

  const NUDGE_COLS = [1, 2, 3];
  const NUDGE_DURATION = 1500;

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

      // Sequential nudges, each 1.5s long. Tap the canvas button during
      // any of them to fast-forward. the loop's `await` resolves
      // immediately at that tween's landed state and the loop continues
      // with the next reel.
      for (const reel of NUDGE_COLS) {
        await reelSet.nudge(reel, {
          distance: 1,
          direction: 'forward',
          incoming: ['wild'],
          duration: NUDGE_DURATION,
        });
      }
    },
  });
  return {
    reelSet,
    // No `onSkip` override needed. the RecipeRunner's built-in fallback
    // detects an in-flight nudge and calls `reelSet.skipNudge()` for us.
    // The recipe deliberately leaves the default behaviour in place so
    // readers can copy the minimal pattern.,
  };
}
