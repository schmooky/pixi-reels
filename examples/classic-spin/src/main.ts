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

const REEL_COUNT = 5;
const VISIBLE_ROWS = 3;
const SYMBOL_SIZE = 140;
const SYMBOL_GAP = 8;

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

async function main() {
  const app = new Application();
  await app.init({
    background: 0x16213e,
    resizeTo: window,
    antialias: true,
  });
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
    .symbols((registry) => {
      for (const id of GAME_SYMBOLS) {
        registry.register(id, BlurSpriteSymbol, {
          textures: symbolTextures,
          blurTextures: symbolBlurTextures,
        });
      }
    })
    .weights({
      low1: 18, low2: 18, low3: 18, low4: 18,
      med1: 12, med2: 12,
      high1: 6, high2: 6,
      wild: 3,
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .ticker(app.ticker)
    .build();

  // Wire blur to spin lifecycle: on for spin phase, off when the reel lands.
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
  frame.roundRect(-12, -12, totalWidth + 24, totalHeight + 24, 10);
  frame.stroke({ color: 0x3498db, width: 3, alpha: 0.8 });
  reelSet.addChildAt(frame, 0);

  function mockSpin(): Promise<{ symbols: string[][]; wins: { positions: { reelIndex: number; rowIndex: number }[] }[] }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const symbols: string[][] = [];
        for (let r = 0; r < REEL_COUNT; r++) {
          const col: string[] = [];
          for (let row = 0; row < VISIBLE_ROWS; row++) {
            const rand = Math.random();
            if (rand < 0.03) col.push('wild');
            else if (rand < 0.09) col.push('high1');
            else if (rand < 0.15) col.push('high2');
            else if (rand < 0.27) col.push('med1');
            else if (rand < 0.39) col.push('med2');
            else if (rand < 0.54) col.push('low1');
            else if (rand < 0.69) col.push('low2');
            else if (rand < 0.84) col.push('low3');
            else col.push('low4');
          }
          symbols.push(col);
        }

        const wins: { positions: { reelIndex: number; rowIndex: number }[] }[] = [];
        for (let row = 0; row < VISIBLE_ROWS; row++) {
          const first = symbols[0][row];
          let count = 1;
          for (let r = 1; r < REEL_COUNT; r++) {
            if (symbols[r][row] === first || symbols[r][row] === 'wild') count++;
            else break;
          }
          if (count >= 3) {
            wins.push({
              positions: Array.from({ length: count }, (_, i) => ({ reelIndex: i, rowIndex: row })),
            });
          }
        }
        resolve({ symbols, wins });
      }, 400);
    });
  }

  const ui = createUI({
    onSpin: () => handleSpin(),
    onSpeedChange: (speed) => reelSet.setSpeed(speed),
    speeds: ['normal', 'turbo', 'superTurbo'],
  });

  let isSpinning = false;

  async function handleSpin() {
    if (isSpinning) {
      try { reelSet.skip(); } catch {}
      return;
    }

    isSpinning = true;
    ui.setSpinning(true);
    ui.showWin(0);
    reelSet.spotlight.hide();

    const spinPromise = reelSet.spin();
    const serverResult = await mockSpin();
    reelSet.setResult(serverResult.symbols);
    await spinPromise;

    isSpinning = false;
    ui.setSpinning(false);

    if (serverResult.wins.length > 0) {
      ui.showWin(serverResult.wins.length * 25);
      const winLines = serverResult.wins.map((w) => ({ positions: w.positions }));
      reelSet.spotlight.cycle(winLines, {
        displayDuration: 1500,
        gapDuration: 200,
        cycles: 2,
      });
    }
  }

  reposition();
  window.addEventListener('resize', reposition);
}

main().catch(console.error);
