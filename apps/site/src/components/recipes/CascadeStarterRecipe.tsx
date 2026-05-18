/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2',
  'square/square_1',
];

const REELS = 6;
const ROWS = 4;
const CLUSTER_SYM = 'royal/royal_1';
const HIT_ROW = 2;
const CLUSTER_COLS = [0, 1, 2];

function randomSymbol(exclude?: string): string {
  let pick = IDS[Math.floor(Math.random() * IDS.length)];
  while (exclude && pick === exclude) pick = IDS[Math.floor(Math.random() * IDS.length)];
  return pick;
}

/**
 * Build the initial landing: a visible cluster of `CLUSTER_SYM` on
 * row `HIT_ROW`, cols 0..2. Everything else is filler that doesn't
 * collide with the cluster id.
 */
function buildInitialGrid(): string[][] {
  return Array.from({ length: REELS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) =>
      r === HIT_ROW && CLUSTER_COLS.includes(c) ? CLUSTER_SYM : randomSymbol(CLUSTER_SYM),
    ),
  );
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
          tumble: {
            fall:   { duration: 280, ease: 'sine.in',       rowStagger: 40 },
            dropIn: { duration: 420, ease: 'back.out(1.6)', rowStagger: 40, distance: 'perHole' },
          },
        });
        return {
          destroy,
          run: async () => {
            const grid = buildInitialGrid();

            // Moment A — drop the initial grid in. With tumble enabled
            // on the builder, `reelSet.spin()` uses cascade phases.
            reelSet.setDropOrder('ltr');
            const p = reelSet.spin();
            await sleep(180);
            reelSet.setResult(grid);
            await p;
            await sleep(300);

            // Spotlight the cluster briefly so the viewer sees what's
            // about to pop.
            const clusterCells = CLUSTER_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
            await reelSet.spotlight.cycle(
              [{ positions: clusterCells.map((c) => ({ reelIndex: c.reel, rowIndex: c.row })) }],
              { displayDuration: 500 },
            );
            reelSet.spotlight.hide();

            // Moment B — one-shot cascade driven by reelSet.runCascade.
            // The cluster cells pop, survivors fall, new symbols drop in.
            // The second detectWinners returns [] (no more clusters), so
            // the chain ends after one refill.
            reelSet.setDropOrder('all');
            let popped = false;
            await reelSet.runCascade({
              detectWinners: () => {
                if (popped) return [];
                popped = true;
                return clusterCells;
              },
              nextGrid: (prev, winners) => {
                // Gravity: in each winning column, the cell at HIT_ROW
                // is empty, so the survivor above falls down by one and
                // a fresh symbol fills the top.
                return prev.map((col, c) => {
                  if (!winners.some((w) => w.reel === c)) return [...col];
                  const next = [...col];
                  for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
                  next[0] = randomSymbol(CLUSTER_SYM);
                  return next;
                });
              },
              pauseAfterDestroyMs: 120,
            });
          },
        };
      }}
    />
  );
}
