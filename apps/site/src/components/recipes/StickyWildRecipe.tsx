/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';
import { loadPrototypeSymbols } from '../../../../../examples/shared/prototypeSpriteLoader.ts';
import { Sprite } from 'pixi.js';
import { gsap } from 'gsap';

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const IDS = [...FILLER, WILD];

function randomFiller(): string {
  return FILLER[Math.floor(Math.random() * FILLER.length)];
}
function fillerGrid(cols: number, rows: number): string[][] {
  return Array.from({ length: cols }, () => Array.from({ length: rows }, () => randomFiller()));
}

/**
 * Sticky-wild scenario. Every wild that lands during the free-spin round
 * persists as an overlay sprite — the underlying reels scroll normally on
 * each respin but the sticky wilds stay fixed on top, pop-scale on arrival.
 */
export default function StickyWildRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const { reelSet, app, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: 72, height: 72 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { 'round/round_1': 22, 'round/round_2': 22, 'royal/royal_1': 18, 'square/square_1': 18 },
        });
        const atlas = await loadPrototypeSymbols();
        const wildTex = atlas.textures[WILD];
        const ghosts: Sprite[] = [];

        const addGhost = (reelIdx: number, row: number) => {
          const sym = reelSet.getReel(reelIdx).getSymbolAt(row);
          const { x, y } = sym.view.toGlobal({ x: 36, y: 36 });
          const ghost = new Sprite(wildTex);
          ghost.anchor.set(0.5);
          const targetSx = 72 / wildTex.width;
          const targetSy = 72 / wildTex.height;
          ghost.x = x; ghost.y = y;
          ghost.scale.set(0);
          ghost.alpha = 0;
          app.stage.addChild(ghost);
          ghosts.push(ghost);
          gsap.to(ghost.scale, { x: targetSx, y: targetSy, duration: 0.35, ease: 'back.out(2)' });
          gsap.to(ghost, { alpha: 1, duration: 0.25 });
        };

        const clearGhosts = () => {
          for (const g of ghosts) {
            try { g.destroy(); } catch { /* ignore */ }
          }
          ghosts.length = 0;
        };

        return {
          destroy: () => { clearGhosts(); destroy(); },
          run: async () => {
            reelSet.setSpeed('turbo');
            clearGhosts();
            const stuck: Array<{ reel: number; row: number }> = [];
            // Scripted wild arrivals — one new wild per respin.
            const arrivals: Array<{ reel: number; row: number }> = [
              { reel: 1, row: 1 },
              { reel: 3, row: 0 },
              { reel: 2, row: 2 },
            ];
            for (const arrival of arrivals) {
              const grid = fillerGrid(5, 3);
              for (const s of stuck) grid[s.reel][s.row] = WILD;
              grid[arrival.reel][arrival.row] = WILD;
              const p = reelSet.spin();
              await sleep(120);
              reelSet.setResult(grid);
              await p;
              stuck.push(arrival);
              addGhost(arrival.reel, arrival.row);
              await sleep(700);
            }
            await sleep(800);
          },
        };
      }}
    />
  );
}
