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
 * Walking-wild scenario. The underlying reels spin normally, but the wild
 * symbol is rendered as a separate overlay sprite parented to the stage —
 * so it stays visually in place (and animates between columns between
 * spins) rather than scrolling away with the reel.
 */
export default function WalkingWildRecipe() {
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
        // Load wild texture from the cached atlas and make an overlay sprite.
        const atlas = await loadPrototypeSymbols();
        const wildTex = atlas.textures[WILD];
        const ghost = new Sprite(wildTex);
        ghost.anchor.set(0.5);
        ghost.scale.set(72 / wildTex.width, 72 / wildTex.height);
        ghost.visible = false;
        app.stage.addChild(ghost);

        const positionGhostOn = (reelIdx: number, row: number) => {
          const sym = reelSet.getReel(reelIdx).getSymbolAt(row);
          const { x, y } = sym.view.toGlobal({ x: 36, y: 36 });
          ghost.x = x;
          ghost.y = y;
        };

        return {
          destroy: () => {
            try { ghost.destroy(); } catch { /* ignore */ }
            destroy();
          },
          run: async () => {
            reelSet.setSpeed('turbo');
            ghost.visible = false;

            // Spin 1 — base game. Wild lands on the rightmost reel, row 1.
            const walkerRow = 1;
            let walkerCol = 4;
            const spin1 = fillerGrid(5, 3);
            spin1[walkerCol][walkerRow] = WILD;
            let p = reelSet.spin();
            await sleep(150);
            reelSet.setResult(spin1);
            await p;
            positionGhostOn(walkerCol, walkerRow);
            ghost.visible = true;
            await sleep(700);

            // Auto-respins — ghost slides one column left during each spin so
            // the wild visually stays "stuck" while the reels scroll beneath.
            for (let target = 3; target >= 0; target--) {
              const grid = fillerGrid(5, 3);
              grid[target][walkerRow] = WILD;

              // Tween the ghost to the next column position.
              const fromReel = reelSet.getReel(walkerCol).getSymbolAt(walkerRow);
              const toReel = reelSet.getReel(target).getSymbolAt(walkerRow);
              const fromPt = fromReel.view.toGlobal({ x: 36, y: 36 });
              const toPt = toReel.view.toGlobal({ x: 36, y: 36 });
              ghost.x = fromPt.x; ghost.y = fromPt.y;
              gsap.to(ghost, { x: toPt.x, y: toPt.y, duration: 0.45, ease: 'power2.inOut' });

              p = reelSet.spin();
              await sleep(100);
              reelSet.setResult(grid);
              await p;
              walkerCol = target;
              await sleep(500);
            }

            // Walker exits — fade out ghost.
            await new Promise<void>((resolve) => {
              gsap.to(ghost, { alpha: 0, duration: 0.35, ease: 'power2.in', onComplete: () => { ghost.visible = false; ghost.alpha = 1; resolve(); } });
            });
            // One final base spin with no wild.
            p = reelSet.spin();
            await sleep(100);
            reelSet.setResult(fillerGrid(5, 3));
            await p;
          },
        };
      }}
    />
  );
}
