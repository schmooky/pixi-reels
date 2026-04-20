/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';
import { bindCenterPivot } from './centerOrigin.ts';
import { gsap } from 'gsap';

const CELL = 72;

const LOW = ['round/round_1', 'round/round_2', 'round/round_3'];
const HIGH = ['royal/royal_1', 'royal/royal_2'];
const IDS = [...LOW, ...HIGH];

export default function SymbolTransformRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: CELL, height: CELL },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { 'round/round_1': 22, 'round/round_2': 22, 'round/round_3': 22, 'royal/royal_1': 10, 'royal/royal_2': 10 },
        });
        return {
          destroy,
          run: async () => {
            // Land a predictable grid so there's always a low-pay to upgrade.
            const grid: string[][] = [
              ['round/round_1', 'round/round_2', 'round/round_1'],
              ['round/round_2', 'round/round_3', 'royal/royal_1'],
              ['round/round_3', 'round/round_1', 'round/round_2'],
              ['royal/royal_2', 'round/round_2', 'round/round_3'],
              ['round/round_1', 'round/round_3', 'round/round_2'],
            ];
            const p = reelSet.spin();
            await sleep(150);
            reelSet.setResult(grid);
            const result = await p;
            await sleep(250);
            // Pick a random low-pay cell and upgrade it to a high-pay.
            const candidates: { reel: number; row: number; id: string }[] = [];
            for (let r = 0; r < 5; r++) {
              for (let row = 0; row < 3; row++) {
                const id = result.symbols[r][row];
                if (LOW.includes(id)) candidates.push({ reel: r, row, id });
              }
            }
            if (candidates.length === 0) return;
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            const upgradeId = HIGH[Math.floor(Math.random() * HIGH.length)];
            const reel = reelSet.getReel(pick.reel);
            const oldSym = reel.getSymbolAt(pick.row);
            // Scale-out around the cell's visual center, not the top-left.
            const restoreOld = bindCenterPivot(oldSym.view, CELL, CELL);
            await new Promise<void>((resolve) => {
              gsap.to(oldSym.view, { alpha: 0, duration: 0.3, ease: 'power2.in', onComplete: () => resolve() });
              gsap.to(oldSym.view.scale, { x: 0.4, y: 0.4, duration: 0.3, ease: 'power2.in' });
            });
            restoreOld();
            const visible = reel.getVisibleSymbols();
            visible[pick.row] = upgradeId;
            reel.placeSymbols(visible);
            const next = reel.getSymbolAt(pick.row);
            next.view.alpha = 0;
            next.view.scale.set(0.4);
            const restoreNext = bindCenterPivot(next.view, CELL, CELL);
            await new Promise<void>((resolve) => {
              gsap.to(next.view, { alpha: 1, duration: 0.35, ease: 'back.out(1.8)', onComplete: () => resolve() });
              gsap.to(next.view.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(1.8)' });
            });
            restoreNext();
            try { next.playWin(); } catch { /* ignore */ }
          },
        };
      }}
    />
  );
}
