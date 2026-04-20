/** @jsxImportSource react */
import { Application, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSetBuilder, SpeedPresets, type ReelSet } from 'pixi-reels';
import RecipeBoard from '../RecipeBoard.tsx';
import { BlurSpriteSymbol } from '../../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../../examples/shared/prototypeSpriteLoader.ts';

const FILLER = ['round/round_1', 'round/round_2', 'round/round_3', 'royal/royal_1'];
const MARK = 'wild/wild_1';
const ALL = [...FILLER, MARK];

const COLS = 5;
const ROWS = 3;
const CELL = 72;
const GAP = 4;
const RESPIN_COL = 2;

let gsapSynced = false;
function syncGsap(app: Application): void {
  if (gsapSynced) return;
  gsapSynced = true;
  try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
  app.ticker.add((t) => gsap.updateRoot(t.lastTime / 1000));
}

function randomFiller(): string {
  return FILLER[Math.floor(Math.random() * FILLER.length)];
}
function randomCol(): string[] {
  return Array.from({ length: ROWS }, randomFiller);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Scripted recipe: the 5×3 board is built from five independent 1-reel
 * ReelSets, one per column. "Holding" a reel just means not calling
 * `.spin()` on that column's reelset — nothing moves, nothing to undo.
 */
export default function SingleReelRespinRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const padX = 14, padY = 14;
        const frameW = COLS * (CELL + GAP) - GAP + padX * 2;
        const frameH = ROWS * (CELL + GAP) - GAP + padY * 2;
        const canvasW = frameW + 40;
        const canvasH = frameH + 40;

        const app = new Application();
        await app.init({
          width: canvasW,
          height: canvasH,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
        });
        syncGsap(app);

        host.innerHTML = '';
        host.appendChild(app.canvas);

        const atlas = await loadPrototypeSymbols();

        const frame = new Graphics();
        frame.roundRect(0, 0, frameW, frameH, 14)
          .fill({ color: 0xffffff, alpha: 1 })
          .stroke({ color: 0xe5dccf, width: 1, alpha: 0.9 });
        frame.x = (canvasW - frameW) / 2;
        frame.y = (canvasH - frameH) / 2;
        app.stage.addChild(frame);

        const columns: ReelSet[] = [];
        for (let col = 0; col < COLS; col++) {
          const rs = new ReelSetBuilder()
            .reels(1)
            .visibleSymbols(ROWS)
            .symbolSize(CELL, CELL)
            .symbolGap(0, GAP)
            .symbols((r) => {
              for (const id of ALL) {
                r.register(id, BlurSpriteSymbol, {
                  textures: atlas.textures,
                  blurTextures: atlas.blurTextures,
                  anchor: { x: 0.5, y: 0.5 },
                  fit: true,
                });
              }
            })
            .weights({ [FILLER[0]]: 22, [FILLER[1]]: 22, [FILLER[2]]: 20, [FILLER[3]]: 18 })
            .speed('normal', SpeedPresets.NORMAL)
            // Stagger the stop moment per column so the full-board spin
            // reads left-to-right even though every column spins in parallel.
            .speed('turbo', { ...SpeedPresets.TURBO, minimumSpinTime: 260 + col * 90 })
            .ticker(app.ticker)
            .build();
          rs.setSpeed('turbo');
          rs.x = frame.x + padX + col * (CELL + GAP);
          rs.y = frame.y + padY;
          app.stage.addChild(rs);

          const reel = rs.getReel(0);
          let blurring = false;
          const setBlur = (on: boolean): void => {
            for (let r = 0; r < ROWS; r++) {
              const sym = reel.getSymbolAt(r);
              if (sym instanceof BlurSpriteSymbol) sym.setBlurred(on);
            }
          };
          reel.events.on('phase:enter', (name) => {
            if (name === 'spin') { blurring = true; setBlur(true); }
            else if (name === 'stop') { blurring = false; setBlur(false); }
          });
          reel.events.on('symbol:created', () => { if (blurring) setBlur(true); });

          columns.push(rs);
        }

        return {
          destroy: () => {
            for (const c of columns) {
              try { c.destroy(); } catch { /* ignore */ }
            }
            try { app.destroy(true, { children: true }); } catch { /* ignore */ }
          },
          run: async () => {
            // 1. Full board spin — every column moves in parallel.
            const firstGrid = Array.from({ length: COLS }, () => randomCol());
            firstGrid[0][1] = MARK;
            const all = columns.map((c, i) => {
              const sp = c.spin();
              c.setResult([firstGrid[i]]);
              return sp;
            });
            await Promise.all(all);
            await sleep(600);

            // 2. Respin only the middle column. The other four reelsets
            //    never receive .spin(), so they stay exactly where they
            //    landed. No setResult on held reels either.
            const next: string[] = [randomFiller(), MARK, randomFiller()];
            const p = columns[RESPIN_COL].spin();
            await sleep(140);
            columns[RESPIN_COL].setResult([next]);
            await p;
            await sleep(900);
          },
        };
      }}
    />
  );
}
