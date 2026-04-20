/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';
import { bindCenterPivot } from './centerOrigin.ts';
import { gsap } from 'gsap';

const CELL = 72;

const LOWS = ['round/round_1', 'round/round_2', 'round/round_3'];
const HIGHS = ['royal/royal_1', 'royal/royal_2', 'square/square_1'];
const MYSTERY = 'bonus/bonus_1'; // standing in for a "?" tile
const IDS = [...LOWS, ...HIGHS, MYSTERY];

function pickReveal(): string {
  const pool = [...LOWS, ...LOWS, ...HIGHS]; // lows weighted heavier
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function MysteryRevealRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: CELL, height: CELL },
          symbols: { kind: 'sprite', ids: IDS },
        });
        return {
          destroy,
          run: async () => {
            // Hand-crafted grid with 3 mystery cells scattered.
            const grid: string[][] = [
              [LOWS[0], MYSTERY, LOWS[1]],
              [LOWS[2], LOWS[0], LOWS[2]],
              [MYSTERY, LOWS[1], LOWS[0]],
              [LOWS[2], LOWS[0], MYSTERY],
              [LOWS[1], LOWS[2], LOWS[0]],
            ];
            const p = reelSet.spin();
            await sleep(150);
            reelSet.setResult(grid);
            await p;
            await sleep(350);
            // Reveal: one shared symbol for all mystery cells.
            const reveal = pickReveal();
            const cells: { r: number; row: number }[] = [];
            for (let r = 0; r < 5; r++) {
              for (let row = 0; row < 3; row++) {
                if (grid[r][row] === MYSTERY) cells.push({ r, row });
              }
            }
            await Promise.all(cells.map(async ({ r, row }) => {
              const reel = reelSet.getReel(r);
              const sym = reel.getSymbolAt(row);
              // Shake (x offset — origin doesn't matter here).
              await new Promise<void>((resolve) => {
                gsap.to(sym.view, { x: '+=6', duration: 0.05, yoyo: true, repeat: 5, ease: 'sine.inOut', onComplete: () => { sym.view.x = 0; resolve(); } });
              });
              // Swap + pop in — scale around the cell's visual center.
              const visible = reel.getVisibleSymbols();
              visible[row] = reveal;
              reel.placeSymbols(visible);
              const next = reel.getSymbolAt(row);
              next.view.scale.set(0);
              const restore = bindCenterPivot(next.view, CELL, CELL);
              await new Promise<void>((resolve) => {
                gsap.to(next.view.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)', onComplete: () => resolve() });
              });
              restore();
            }));
          },
        };
      }}
    />
  );
}
