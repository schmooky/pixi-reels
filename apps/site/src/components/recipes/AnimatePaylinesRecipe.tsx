/** @jsxImportSource react */
import { gsap } from 'gsap';
import type { ReelSet } from 'pixi-reels';
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, spinToGrid, sleep } from '../miniRuntime.ts';

const A = 'round/round_1';
const B = 'round/round_2';
const C = 'round/round_3';
const SEVEN = 'royal/royal_1';             // the premium line symbol
const IDS = [A, B, C, SEVEN];

// Three full rows of different symbols = three "paylines" with the premium
// on top, B on row 1, C on row 2. The spotlight cycles through each row.
const GRID: string[][] = [
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
];

type Cell = { reel: number; row: number };

/**
 * Scale a symbol's view from its visual center. Containers are anchored at
 * top-left of the cell, so scaling directly shrinks from the corner —
 * set pivot to the local bounds center and compensate position, then scale.
 */
function scaleFromCenter(view: import('pixi.js').Container, target: number, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const bounds = view.getLocalBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const origPivotX = view.pivot.x;
    const origPivotY = view.pivot.y;
    const origX = view.x;
    const origY = view.y;
    view.pivot.set(cx, cy);
    view.x = origX + (cx - origPivotX);
    view.y = origY + (cy - origPivotY);
    gsap.to(view.scale, {
      x: target,
      y: target,
      duration,
      ease: 'back.out(2)',
      onComplete: () => {
        gsap.to(view.scale, {
          x: 1,
          y: 1,
          duration: duration * 0.75,
          ease: 'power2.inOut',
          onComplete: () => {
            view.pivot.set(origPivotX, origPivotY);
            view.x = origX;
            view.y = origY;
            resolve();
          },
        });
      },
    });
  });
}

async function cyclePaylinesManually(reelSet: ReelSet, lines: Cell[][]): Promise<void> {
  const reelCount = reelSet.reels.length;
  const visibleRows = reelSet.getReel(0).getVisibleSymbols().length;

  for (const line of lines) {
    const winnerKeys = new Set(line.map((c) => `${c.reel},${c.row}`));
    // Dim everything that's not on the current payline.
    for (let r = 0; r < reelCount; r++) {
      for (let row = 0; row < visibleRows; row++) {
        const view = reelSet.getReel(r).getSymbolAt(row).view;
        const isWinner = winnerKeys.has(`${r},${row}`);
        gsap.to(view, { alpha: isWinner ? 1 : 0.25, duration: 0.2 });
      }
    }
    // Zoom each winner sequentially for a more readable payline sweep.
    for (const c of line) {
      const view = reelSet.getReel(c.reel).getSymbolAt(c.row).view;
      // Don't await each — let them overlap slightly so the sweep feels live.
      void scaleFromCenter(view, 1.22, 0.18);
      await sleep(90);
    }
    await sleep(480);
  }

  // Restore every cell.
  for (let r = 0; r < reelCount; r++) {
    for (let row = 0; row < visibleRows; row++) {
      const view = reelSet.getReel(r).getSymbolAt(row).view;
      gsap.to(view, { alpha: 1, duration: 0.2 });
    }
  }
}

export default function AnimatePaylinesRecipe() {
  return (
    <RecipeBoard
      height={300}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: 78, height: 78 },
          symbols: { kind: 'sprite', ids: IDS },
        });
        return {
          destroy,
          run: async () => {
            await spinToGrid(reelSet, GRID);
            await sleep(240);
            const mkLine = (row: number): Cell[] =>
              Array.from({ length: 5 }, (_, reel) => ({ reel, row }));
            await cyclePaylinesManually(reelSet, [mkLine(0), mkLine(1), mkLine(2)]);
          },
        };
      }}
    />
  );
}
