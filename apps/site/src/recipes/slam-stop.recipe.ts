import { CARD_DECK, CardSymbol, ReelSetBuilder, SpeedPresets, WILD_CARD } from 'pixi-reels';
import { tapToSpin } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Slam-stop',
  topic: 'cells-and-banners',
  tags: ['paylines', 'hit-areas', 'overlays', 'wins', 'horizontal', 'orientation'],
} as const satisfies RecipeMeta;

export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const A = '7', B = '8', C = '9';
  const SEVEN = 'A'; // letter-card stand-in. constant kept as SEVEN for readability
  const IDS = [A, B, C, SEVEN];

  const GRID = [
    [SEVEN, A, B],
    [C, SEVEN, A],
    [B, C, SEVEN],
    [A, SEVEN, B],
    [C, A, SEVEN],
  ];

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols(r => {
      for (const sym of [...CARD_DECK, WILD_CARD]) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const p = reelSet.spin();
      // requestSkip queues until setResult arrives. call it from a player tap
      // anywhere in the round and the engine will land as soon as it has a
      // target, no race-window to manage in your UI code.
      setTimeout(() => reelSet.requestSkip(), 560);
      // Server response arrives a moment later. requestSkip is already armed.
      setTimeout(() => reelSet.setResult(GRID.map((visible) => ({ visible }))), 800);
      await p;
    },
  });
  return { reelSet };
}
