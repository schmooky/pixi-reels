/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';
import { runCascade } from '../../../../../examples/shared/cascadeLoop.ts';

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2',
  'square/square_1',
];

const REELS = 6;
const ROWS = 4;

function randomSymbol(exclude?: string): string {
  let pick = IDS[Math.floor(Math.random() * IDS.length)];
  while (exclude && pick === exclude) pick = IDS[Math.floor(Math.random() * IDS.length)];
  return pick;
}

/**
 * Build a sequence of cascade stages for the demo:
 *   stage 0: a visible cluster of `clusterSym` on row `hitRow`, cols 0..clusterSize-1
 *   stage 1: winners replaced by random fillers; survivors have fallen; fresh
 *            symbols fill the top slots. The new top-row may or may not
 *            produce another cluster — we intentionally pick fillers that
 *            don't repeat clusterSym so the chain stops cleanly.
 */
function buildStages(): string[][][] {
  const clusterSym = 'royal/royal_1';
  const hitRow = 2;
  const clusterCols = [0, 1, 2];

  const stage0: string[][] = Array.from({ length: REELS }, (_, c) => Array.from({ length: ROWS }, (_, r) => {
    if (r === hitRow && clusterCols.includes(c)) return clusterSym;
    return randomSymbol(clusterSym);
  }));

  // Stage 1 gravity: in each winning column, the cell at hitRow is empty, so
  // the survivor above it drops down by one and a fresh random fills the top.
  const stage1: string[][] = stage0.map((col, c) => {
    if (!clusterCols.includes(c)) return [...col];
    const newCol = [...col];
    for (let r = hitRow; r > 0; r--) newCol[r] = newCol[r - 1];
    newCol[0] = randomSymbol(clusterSym);
    return newCol;
  });

  return [stage0, stage1];
}

export default function CascadeStarterRecipe() {
  return (
    <RecipeBoard
      height={340}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: REELS, visibleRows: ROWS,
          symbolSize: { width: 54, height: 54 },
          symbols: { kind: 'sprite', ids: IDS },
        });
        return {
          destroy,
          run: async () => {
            const stages = buildStages();

            // Land stage 0 via a normal spin.
            const p = reelSet.spin();
            await sleep(180);
            reelSet.setResult(stages[0]);
            await p;
            await sleep(300);

            // Spotlight the winning cluster briefly.
            const clusterCells = [
              { reel: 0, row: 2 },
              { reel: 1, row: 2 },
              { reel: 2, row: 2 },
            ];
            await reelSet.spotlight.cycle(
              [{ positions: clusterCells.map((c) => ({ reelIndex: c.reel, rowIndex: c.row })) }],
              { displayDuration: 500 },
            );
            reelSet.spotlight.hide();

            // Run the cascade: fade only the cluster cells, then drop
            // survivors + fresh fill. We override `winners` because the
            // default diffCells flags every row in a gravity column — we
            // only want the matching cluster to pop, not every survivor.
            await runCascade(reelSet, stages, {
              winners: () => clusterCells,
              vanishDuration: 300,
              dropDuration: 420,
              pauseBetween: 120,
            });
          },
        };
      }}
    />
  );
}
