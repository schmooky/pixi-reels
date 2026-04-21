import { Application, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
} from 'pixi-reels';
import { loadPrototypeSymbols } from '../../shared/prototypeSpriteLoader.js';
import { BlurSpriteSymbol } from '../../shared/BlurSpriteSymbol.js';
import { createUI } from '../../shared/ui.js';

const REEL_COUNT = 6;
const VISIBLE_ROWS = 5;
const SYMBOL_SIZE = 95;
const SYMBOL_GAP = 5;
const SLOT_H = SYMBOL_SIZE + SYMBOL_GAP;

const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1',
  low2: 'round/round_2',
  low3: 'round/round_3',
  low4: 'round/round_4',
  med1: 'royal/royal_1',
  med2: 'royal/royal_2',
  high1: 'royal/royal_3',
  high2: 'royal/royal_4',
  wild: 'wild/wild_1',
};
const GAME_SYMBOLS = Object.keys(SYMBOL_MAP);

function randomSymbol(): string {
  const r = Math.random();
  if (r < 0.03) return 'wild';
  if (r < 0.08) return 'high1';
  if (r < 0.13) return 'high2';
  if (r < 0.23) return 'med1';
  if (r < 0.33) return 'med2';
  if (r < 0.48) return 'low1';
  if (r < 0.63) return 'low2';
  if (r < 0.78) return 'low3';
  return 'low4';
}

function detectWins(grid: string[][]): { reelIndex: number; rowIndex: number }[][] {
  const wins: { reelIndex: number; rowIndex: number }[][] = [];
  for (let row = 0; row < VISIBLE_ROWS; row++) {
    const first = grid[0][row];
    if (first === 'wild') continue;
    let count = 1;
    for (let r = 1; r < REEL_COUNT; r++) {
      if (grid[r][row] === first || grid[r][row] === 'wild') count++;
      else break;
    }
    if (count >= 3) {
      wins.push(Array.from({ length: count }, (_, i) => ({ reelIndex: i, rowIndex: row })));
    }
  }
  return wins;
}

async function main() {
  const app = new Application();
  await app.init({ background: 0x0f3460, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  gsap.ticker.remove(gsap.updateRoot);
  app.ticker.add(() => gsap.updateRoot(app.ticker.lastTime / 1000));

  const { textures, blurTextures } = await loadPrototypeSymbols();
  const symbolTextures: Record<string, typeof textures[string]> = {};
  const symbolBlurTextures: Record<string, typeof textures[string]> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
    if (blurTextures[atlasKey]) symbolBlurTextures[id] = blurTextures[atlasKey];
  }

  const reelSet = new ReelSetBuilder()
    .reels(REEL_COUNT)
    .visibleSymbols(VISIBLE_ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      for (const id of GAME_SYMBOLS) {
        r.register(id, BlurSpriteSymbol, {
          textures: symbolTextures,
          blurTextures: symbolBlurTextures,
        });
      }
    })
    .weights({ low1: 18, low2: 18, low3: 18, low4: 18, med1: 12, med2: 12, high1: 6, high2: 6, wild: 3 })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .ticker(app.ticker)
    .build();

  for (const reel of reelSet.reels) {
    reel.events.on('phase:enter', (name) => {
      const blurred = name === 'spin';
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const sym = reel.getSymbolAt(row);
        if (sym instanceof BlurSpriteSymbol) sym.setBlurred(blurred);
      }
    });
  }

  enableDebug(reelSet);

  const totalWidth = REEL_COUNT * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const totalHeight = VISIBLE_ROWS * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const wrapper = new Container();
  wrapper.addChild(reelSet);
  app.stage.addChild(wrapper);

  function reposition() {
    const pad = 16, uiH = 80;
    const s = Math.min((app.screen.width - pad * 2) / totalWidth, (app.screen.height - pad * 2 - uiH) / totalHeight, 1);
    wrapper.scale.set(s);
    wrapper.x = (app.screen.width - totalWidth * s) / 2;
    wrapper.y = (app.screen.height - totalHeight * s - uiH) / 2;
  }

  const frame = new Graphics();
  frame.roundRect(-10, -10, totalWidth + 20, totalHeight + 20, 8);
  frame.stroke({ color: 0xe74c3c, width: 3 });
  reelSet.addChildAt(frame, 0);

  const multiplierEl = document.getElementById('multiplier')!;
  const ui = createUI({
    onSpin: () => handleSpin(),
    onSpeedChange: (s) => reelSet.setSpeed(s),
    speeds: ['normal', 'turbo', 'superTurbo'],
  });

  let isSpinning = false;

  async function explode(positions: { reelIndex: number; rowIndex: number }[]): Promise<void> {
    reelSet.viewport.showDim(0.35);

    const winPromises: Promise<void>[] = [];
    for (const pos of positions) {
      const symbol = reelSet.reels[pos.reelIndex].getSymbolAt(pos.rowIndex);
      if (symbol) {
        symbol.view.zIndex = 1000;
        winPromises.push(symbol.playWin());
      }
    }
    await Promise.all(winPromises);

    const fadePromises: Promise<void>[] = [];
    for (const pos of positions) {
      const symbol = reelSet.reels[pos.reelIndex].getSymbolAt(pos.rowIndex);
      if (symbol) {
        fadePromises.push(
          new Promise<void>((resolve) => {
            gsap.to(symbol.view, { alpha: 0, duration: 0.25, ease: 'power2.in', onComplete: resolve });
          }),
        );
      }
    }
    await Promise.all(fadePromises);
    reelSet.viewport.hideDim();
  }

  async function cascade(
    currentGrid: string[][],
    removedPositions: { reelIndex: number; rowIndex: number }[],
  ): Promise<string[][]> {
    const newGrid: string[][] = currentGrid.map((col) => [...col]);

    const removedByReel = new Map<number, Set<number>>();
    for (const p of removedPositions) {
      if (!removedByReel.has(p.reelIndex)) removedByReel.set(p.reelIndex, new Set());
      removedByReel.get(p.reelIndex)!.add(p.rowIndex);
    }

    const allAnimations: gsap.core.Tween[] = [];

    for (let col = 0; col < REEL_COUNT; col++) {
      const removed = removedByReel.get(col);
      if (!removed || removed.size === 0) continue;

      const reel = reelSet.reels[col];

      const survivors: string[] = [];
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        if (!removed.has(row)) {
          survivors.push(newGrid[col][row]);
        }
      }
      const gapCount = VISIBLE_ROWS - survivors.length;
      const newSymbols: string[] = [];
      for (let i = 0; i < gapCount; i++) {
        newSymbols.push(randomSymbol());
      }

      const finalCol = [...newSymbols, ...survivors];
      newGrid[col] = finalCol;

      reel.placeSymbols(finalCol);
      reel.snapToGrid();

      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const symbol = reel.getSymbolAt(row);
        if (!symbol) continue;

        symbol.view.alpha = 1;
        symbol.view.scale.set(1, 1);
        symbol.view.zIndex = 0;

        if (row < gapCount) {
          const targetY = symbol.view.y;
          const startOffset = (gapCount - row) * SLOT_H;
          symbol.view.y = targetY - startOffset;

          allAnimations.push(
            gsap.to(symbol.view, {
              y: targetY,
              duration: 0.25 + row * 0.04,
              ease: 'bounce.out',
              delay: row * 0.03,
            }),
          );
        }
      }
    }

    if (allAnimations.length > 0) {
      await Promise.all(allAnimations.map((t) => new Promise<void>((r) => { t.eventCallback('onComplete', r); })));
    }

    return newGrid;
  }

  async function handleSpin() {
    if (isSpinning) { try { reelSet.skip(); } catch {} return; }

    isSpinning = true;
    ui.setSpinning(true);
    ui.showWin(0);
    multiplierEl.textContent = '';

    for (const reel of reelSet.reels) {
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const sym = reel.getSymbolAt(row);
        if (sym) { sym.view.alpha = 1; sym.view.scale.set(1, 1); sym.view.zIndex = 0; }
      }
    }
    reelSet.viewport.hideDim();

    const spinPromise = reelSet.spin();
    await wait(400);

    const initialGrid: string[][] = [];
    for (let r = 0; r < REEL_COUNT; r++) {
      const col: string[] = [];
      for (let row = 0; row < VISIBLE_ROWS; row++) col.push(randomSymbol());
      initialGrid.push(col);
    }
    reelSet.setResult(initialGrid);
    await spinPromise;

    let grid = initialGrid;
    let wins = detectWins(grid);
    let cascadeLevel = 0;
    let totalWin = 0;

    while (wins.length > 0) {
      cascadeLevel++;
      const allPositions = wins.flat();
      totalWin += allPositions.length * 5 * cascadeLevel;

      multiplierEl.textContent = `CASCADE x${cascadeLevel}`;
      ui.showWin(totalWin);

      await explode(allPositions);
      await wait(100);

      grid = await cascade(grid, allPositions);
      await wait(150);

      wins = detectWins(grid);
    }

    if (cascadeLevel === 0) multiplierEl.textContent = '';
    isSpinning = false;
    ui.setSpinning(false);
  }

  function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

  reposition();
  window.addEventListener('resize', reposition);
}

main().catch(console.error);
