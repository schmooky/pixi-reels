/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';

const A = 'round/round_1';
const B = 'round/round_2';
const C = 'round/round_3';
const S = 'bonus/bonus_1';           // scatter
const IDS = [A, B, C, S];

// Two scatters on reels 0 and 2, reel 4 blanks — classic near-miss.
const GRID: string[][] = [
  [S, A, B],
  [B, A, C],
  [A, S, B],
  [C, A, B],
  [B, C, A],   // reel 4 has no scatter
];

export default function NearMissRecipe() {
  return (
    <RecipeBoard
      height={300}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: 78, height: 78 },
          symbols: { kind: 'sprite', ids: IDS },
        });
        return {
          destroy,
          run: async () => {
            const promise = reelSet.spin();
            await sleep(220);
            reelSet.setAnticipation([4]);
            reelSet.setResult(GRID);
            await promise;
          },
        };
      }}
    />
  );
}
