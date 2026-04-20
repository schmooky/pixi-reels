/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep, spinToGrid } from '../miniRuntime.ts';

const FILLER = ['round/round_1', 'round/round_2', 'round/round_3', 'royal/royal_1'];
const MARK = 'wild/wild_1';
const IDS = [...FILLER, MARK];

function randomFiller(): string {
  return FILLER[Math.floor(Math.random() * FILLER.length)];
}
function fillerGrid(cols: number, rows: number): string[][] {
  return Array.from({ length: cols }, () => Array.from({ length: rows }, () => randomFiller()));
}

/**
 * Scripted demo: land a full main spin, then respin only reel 2. Every
 * other reel is "held" by re-feeding its currently-visible symbols.
 */
export default function SingleReelRespinRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: 72, height: 72 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { 'round/round_1': 22, 'round/round_2': 22, 'round/round_3': 20, 'royal/royal_1': 18 },
        });

        return {
          destroy,
          run: async () => {
            reelSet.setSpeed('turbo');

            // 1. Main spin — land a random board with a wild on reel 0.
            const firstGrid = fillerGrid(5, 3);
            firstGrid[0][1] = MARK;
            await spinToGrid(reelSet, firstGrid, 180);
            await sleep(600);

            // 2. Respin only reel 2. Freeze the other reels by feeding them
            //    their current visible symbols. The library treats the
            //    grid as the truth — reels whose column matches what they
            //    already show just snap back, no motion.
            const held: string[][] = [];
            for (let r = 0; r < 5; r++) {
              const reel = reelSet.getReel(r);
              const col: string[] = [];
              for (let row = 0; row < 3; row++) {
                const sym = reel.getSymbolAt(row);
                col.push(sym.symbolId);
              }
              held.push(col);
            }
            held[2] = [randomFiller(), MARK, randomFiller()];

            const p = reelSet.spin();
            await sleep(140);
            reelSet.setResult(held);
            await p;

            await sleep(900);
          },
        };
      }}
    />
  );
}
