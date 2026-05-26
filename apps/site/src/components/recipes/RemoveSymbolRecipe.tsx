/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, spinToGrid, sleep } from '../miniRuntime.ts';
import type { Cell } from 'pixi-reels';

const A = 'round/round_1';
const B = 'round/round_2';
const C = 'round/round_3';
const X = 'bonus/bonus_1';           // the winner that vanishes
const IDS = [A, B, C, X];

/**
 * BEFORE: X cells are the winners to remove.
 * AFTER:  the grid after real cascade gravity. winners cleared,
 * survivors slide DOWN past cleared slots, new symbols enter from
 * above. The contract matches `reelSet.refill({ winners, grid })`:
 * per reel, the top `winners.length` rows are new, the rest are
 * survivors in their original top-to-bottom order.
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
          tumble: {
            fall:   { duration: 0, ease: 'none', rowStagger: 0 },
            dropIn: { duration: 440, ease: 'back.out(1.6)', rowStagger: 0, distance: 'perHole' },
          },
        });
        return {
          destroy,
          run: async () => {
            // Land BEFORE via a normal strip-spin (the builder's tumble
            // config doesn't kick in until refill).
            await spinToGrid(reelSet, BEFORE);
            await sleep(300);

            // Canonical cascade primitives. same two calls every cascade
            // chain uses, just one cascade level.
            const winners = winnersOfX(BEFORE);
            await reelSet.destroySymbols(winners);
            await sleep(120);
            await reelSet.refill({ winners, grid: AFTER.map((visible) => ({ visible })) });
          },
        };
      }}
    />
  );
}
