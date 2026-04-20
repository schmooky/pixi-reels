/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';
import { SpeedPresets } from 'pixi-reels';

const A = 'round/round_1';
const B = 'round/round_2';
const C = 'round/round_3';
const S = 'bonus/bonus_1';           // scatter
const IDS = [A, B, C, S];

// 2 scatters on reels 0 and 2, reel 4 blanks. Anticipation holds reels 3+4.
const GRID: string[][] = [
  [S, A, B],
  [A, B, C],
  [B, S, A],
  [C, A, B],
  [B, C, A],
];

export default function AnticipateRecipe() {
  return (
    <RecipeBoard
      height={300}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: 78, height: 78 },
          symbols: { kind: 'sprite', ids: IDS },
        });
        // Slow anticipation specifically for the recipe demo so the "hold"
        // on reels 3 and 4 is visible — the default 450ms is gameplay-tuned
        // but reads as a blink in a teaching context.
        reelSet.speed.addProfile('anticipateDemo', {
          ...SpeedPresets.NORMAL,
          anticipationDelay: 2000,
        });
        reelSet.setSpeed('anticipateDemo');
        return {
          destroy,
          run: async () => {
            const promise = reelSet.spin();
            await sleep(220);
            reelSet.setAnticipation([3, 4]);
            reelSet.setResult(GRID);
            await promise;
          },
        };
      }}
    />
  );
}
