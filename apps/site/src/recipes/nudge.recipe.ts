import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { readout, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Nudge a reel',
  topic: 'nudge',
  tags: ['nudge', 'stagger', 'spotlight', 'big-symbols', 'abort', 'skip', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// Nudge demo. After every spin lands, the engine fires two nudges in sequence:
//   1. Reel 1 down by 1. a wild slides in from the top.
//   2. Reel 3 up by 1  . a wild slides in from the bottom.
// One press shows both directions in one beat.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const SYMBOLS = [...CARD_DECK, WILD_CARD];

  const FILLER = ['7', '8', '9', '10', 'J'];
  const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
  const col3 = () => [filler(), filler(), filler()];

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const sym of SYMBOLS) {
        r.register(sym.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  // Show every nudge under the reels. useful for observing the
  // `nudge:start` / `nudge:complete` pair. One row per event: reel 3 starts in
  // the same frame reel 1 completes, so a single line would never show that
  // completion.
  const W = reelSet.viewport.maskWidth;
  const H = reelSet.viewport.maskHeight;
  const last = { start: '-', complete: '-' };
  const hud = readout.plaque({ minWidth: W, maxWidth: W });
  const render = () => {
    hud.text = `nudge:start    ${last.start}\nnudge:complete ${last.complete}`;
  };
  render();
  hud.position.set(0, H + 10);
  reelSet.addChild(hud);

  reelSet.events.on('spin:start', () => {
    last.start = last.complete = '-';
    render();
  });
  reelSet.events.on('nudge:start', (info) => {
    last.start = `reel=${info.reelIndex} ${info.direction} by ${info.distance}`;
    render();
  });
  reelSet.events.on('nudge:complete', (info) => {
    // `symbols` is the new visible column, top-down: where the wild landed.
    last.complete = `reel=${info.reelIndex} ${info.direction} by ${info.distance} -> [${info.symbols.join(', ')}]`;
    render();
  });

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      // Land on a flat near-miss. no wilds visible anywhere.
      const p = reelSet.spin();
      await new Promise((resolve) => setTimeout(resolve, 220));
      reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
      await p;

      // Give the eye a beat to register the landed board.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 1. Nudge reel 1 DOWN by 1. `wild` enters from the top.
      await reelSet.nudge(1, {
        distance: 1,
        direction: 'forward',
        incoming: ['wild'],
        duration: 420,
      });

      // 2. Nudge reel 3 UP by 1. `wild` enters from the bottom.
      await reelSet.nudge(3, {
        distance: 1,
        direction: 'reverse',
        incoming: ['wild'],
        duration: 420,
      });
    },
  });
  return { reelSet };
}
