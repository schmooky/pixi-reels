/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';

const A = 'round/round_1';
const B = 'round/round_2';
const C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];

const GRID: string[][] = [
  [SEVEN, A, B],
  [C, SEVEN, A],
  [B, C, SEVEN],
  [A, SEVEN, B],
  [C, A, SEVEN],
];

export default function SlamStopRecipe() {
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
            reelSet.setResult(GRID);
            await sleep(560);
            reelSet.skip();
            const r = await promise;
            if (!r.wasSkipped) console.warn('expected wasSkipped');
          },
        };
      }}
    />
  );
}
