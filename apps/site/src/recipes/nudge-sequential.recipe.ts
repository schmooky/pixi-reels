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

// SEQUENTIAL nudges. each reel waits for the previous reel's nudge to
// land before starting. Reads as three deliberate beats; players can
// follow each reveal individually. Total time = N * duration.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const SYMBOLS = [...CARD_DECK, WILD_CARD];
  const FILLER = ['7', '8', '9', '10', 'J'];
  const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
  const col3 = () => [filler(), filler(), filler()];

  const NUDGE_COLS = [1, 2, 3];
  const NUDGE_DURATION = 480;

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

  // Every nudge event under the reels: the reels that fired each one this
  // spin, in order. Here the complete row trails the start row by one reel:
  // each nudge lands before the next one starts.
  const W = reelSet.viewport.maskWidth;
  const H = reelSet.viewport.maskHeight;
  const fired: { start: number[]; complete: number[] } = { start: [], complete: [] };
  const hud = readout.plaque({ minWidth: W, maxWidth: W });
  const render = () => {
    const reels = (list: number[]) => (list.length ? `reel=${list.join(',')}` : '-');
    hud.text = `nudge:start    ${reels(fired.start)}\nnudge:complete ${reels(fired.complete)}`;
  };
  render();
  hud.position.set(0, H + 10);
  reelSet.addChild(hud);

  reelSet.events.on('spin:start', () => {
    fired.start = [];
    fired.complete = [];
    render();
  });
  reelSet.events.on('nudge:start', (info) => {
    fired.start.push(info.reelIndex);
    render();
  });
  reelSet.events.on('nudge:complete', (info) => {
    fired.complete.push(info.reelIndex);
    render();
  });

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const p = reelSet.spin();
      await new Promise((resolve) => setTimeout(resolve, 220));
      reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
      await p;

      // Let the eye settle on the landed board before the nudges begin.
      await new Promise((resolve) => setTimeout(resolve, 400));

      // SEQUENTIAL. each `await` blocks the next iteration until this
      // reel's tween finishes. Total wall time = NUDGE_COLS.length * NUDGE_DURATION.
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
  return { reelSet };
}
