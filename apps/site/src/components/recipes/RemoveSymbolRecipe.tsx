/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, spinToGrid, fadeOutCells, sleep } from '../miniRuntime.ts';
import { tumbleToGrid, type Cell } from '../../../../../examples/shared/cascadeLoop.ts';

const A = 'round/round_1';
const B = 'round/round_2';
const C = 'round/round_3';
const X = 'bonus/bonus_1';           // the winner that vanishes
const IDS = [A, B, C, X];

/**
 * BEFORE: X cells are the winners to remove.
 * AFTER: the grid after real cascade gravity — winners cleared, survivors
 * preserve their symbol id but slide DOWN past cleared slots, and new
 * symbols appear at the top. See `/architecture/cascade/` for the full
 * physics.
 */
const BEFORE: string[][] = [
  [X, A, B],
  [X, C, A],
  [X, B, C],
  [A, C, X],
];
const AFTER: string[][] = [
  [C, A, B],
  [B, C, A],
  [A, B, C],
  [B, A, C],
];

function winnersOfX(grid: string[][]): Cell[] {
  const out: Cell[] = [];
  for (let reel = 0; reel < grid.length; reel++) {
    for (let row = 0; row < grid[reel].length; row++) {
      if (grid[reel][row] === X) out.push({ reel, row });
    }
  }
  return out;
}

export default function RemoveSymbolRecipe() {
  return (
    <RecipeBoard
      height={300}
      label="Replay"
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 4, visibleRows: 3,
          symbolSize: { width: 80, height: 80 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { [A]: 25, [B]: 25, [C]: 25, [X]: 25 },
        });
        return {
          destroy,
          run: async () => {
            await spinToGrid(reelSet, BEFORE);
            await sleep(300);
            const winners = winnersOfX(BEFORE);
            await fadeOutCells(reelSet, winners, 340);
            await sleep(120);
            await tumbleToGrid(reelSet, AFTER, winners, { dropDuration: 440 });
          },
        };
      }}
    />
  );
}
