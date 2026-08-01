/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2',
  'square/square_1', 'wild/wild_1',
];

export default function ClassicStarterRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleCells: 3,
          symbolSize: { width: 72, height: 72 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { 'round/round_1': 20, 'round/round_2': 20, 'round/round_3': 20, 'royal/royal_1': 14, 'royal/royal_2': 14, 'square/square_1': 10, 'wild/wild_1': 3 },
        });
        return {
          destroy,
          run: async () => {
            // Force a guaranteed line win so the spotlight recipe is visible.
            const winSymbol = 'royal/royal_1';
            const grid: string[][] = [
              [winSymbol, 'round/round_2', 'round/round_1'],
              [winSymbol, 'round/round_3', 'square/square_1'],
              [winSymbol, 'round/round_1', 'round/round_2'],
              ['round/round_3', 'royal/royal_2', 'round/round_1'],
              ['round/round_2', 'round/round_3', 'square/square_1'],
            ];
            const p = reelSet.spin();
            await sleep(150);
            reelSet.setResult(grid.map((visible) => ({ visible })));
            const result = await p;
            // Spotlight any 3+ in a cell from left.
            const wins: { positions: { reelIndex: number; cellIndex: number }[] }[] = [];
            for (let cell = 0; cell < 3; cell++) {
              const first = result.symbols[0][cell];
              if (!first) continue;
              let count = 1;
              for (let r = 1; r < result.symbols.length; r++) {
                if (result.symbols[r][cell] === first || result.symbols[r][cell] === 'wild/wild_1') count++;
                else break;
              }
              if (count >= 3) {
                wins.push({ positions: Array.from({ length: count }, (_, i) => ({ reelIndex: i, cellIndex: cell })) });
              }
            }
            if (wins.length) {
              await reelSet.spotlight.cycle(wins, { displayDuration: 900 });
            }
          },
        };
      }}
    />
  );
}
