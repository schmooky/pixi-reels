import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
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
const SYMBOL_SIZE = 130;
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
  bonus: 'bonus/bonus_1',
};
const MAIN_SYMBOLS = Object.keys(SYMBOL_MAP);
const BONUS_VALUES = [1, 2, 3, 5, 10, 25, 50];

async function main() {
  const app = new Application();
  await app.init({ background: 0x0a0a23, resizeTo: window, antialias: true });
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

  const totalWidth = REEL_COUNT * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const totalHeight = VISIBLE_ROWS * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const centerX = () => (app.screen.width - totalWidth) / 2;
  const centerY = () => (app.screen.height - totalHeight) / 2 - 30;

  const mainReelSet = new ReelSetBuilder()
    .reels(REEL_COUNT)
    .visibleSymbols(VISIBLE_ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      for (const id of MAIN_SYMBOLS) {
        r.register(id, BlurSpriteSymbol, {
          textures: symbolTextures,
          blurTextures: symbolBlurTextures,
        });
      }
    })
    .weights({ low1: 18, low2: 18, low3: 18, low4: 18, med1: 12, med2: 12, high1: 6, high2: 6, wild: 3, bonus: 6 })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .ticker(app.ticker)
    .build();

  for (const reel of mainReelSet.reels) {
    reel.events.on('phase:enter', (name) => {
      const blurred = name === 'spin';
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const sym = reel.getSymbolAt(row);
        if (sym instanceof BlurSpriteSymbol) sym.setBlurred(blurred);
      }
    });
  }

  enableDebug(mainReelSet);
  mainReelSet.x = centerX();
  mainReelSet.y = centerY();

  const mainFrame = new Graphics();
  mainFrame.roundRect(-10, -10, totalWidth + 20, totalHeight + 20, 8);
  mainFrame.stroke({ color: 0x9b59b6, width: 3 });
  mainReelSet.addChildAt(mainFrame, 0);
  app.stage.addChild(mainReelSet);

  const statusEl = document.getElementById('status')!;

  const bonusContainer = new Container();
  bonusContainer.visible = false;
  bonusContainer.x = centerX();
  bonusContainer.y = centerY();
  app.stage.addChild(bonusContainer);

  interface BonusCell {
    col: number;
    row: number;
    container: Container;
    reelSet: ReturnType<typeof ReelSetBuilder.prototype.build> | null;
    locked: boolean;
    value: number;
    bg: Graphics;
    valueText: Text;
  }

  const bonusCells: BonusCell[] = [];

  for (let col = 0; col < REEL_COUNT; col++) {
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const cellContainer = new Container();
      cellContainer.x = col * (SYMBOL_SIZE + SYMBOL_GAP);
      cellContainer.y = row * (SYMBOL_SIZE + SYMBOL_GAP);

      const bg = new Graphics();
      bg.roundRect(0, 0, SYMBOL_SIZE, SYMBOL_SIZE, 10);
      bg.fill({ color: 0x1a1a3e });
      bg.stroke({ color: 0x333366, width: 1 });
      cellContainer.addChild(bg);

      const cellReelSet = new ReelSetBuilder()
        .reels(1)
        .visibleSymbols(1)
        .symbolSize(SYMBOL_SIZE - 10, SYMBOL_SIZE - 10)
        .symbolGap(0, 0)
        .symbols((r) => {
          r.register('bonus', BlurSpriteSymbol, {
            textures: { bonus: symbolTextures.bonus },
            blurTextures: symbolBlurTextures.bonus ? { bonus: symbolBlurTextures.bonus } : {},
          });
        })
        .weights({ bonus: 10 })
        .speed('normal', {
          ...SpeedPresets.NORMAL,
          spinDelay: 0,
          stopDelay: 0,
          bounceDistance: 8,
          bounceDuration: 150,
          minimumSpinTime: 300 + (col + row * REEL_COUNT) * 80,
        })
        .ticker(app.ticker)
        .build();

      cellReelSet.x = 5;
      cellReelSet.y = 5;
      cellReelSet.visible = false;
      cellContainer.addChild(cellReelSet);

      const valueText = new Text({
        text: '',
        style: new TextStyle({
          fontSize: 32, fontWeight: 'bold',
          fill: 0xffd700, fontFamily: 'Arial',
          dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 2 },
        }),
      });
      valueText.anchor.set(0.5);
      valueText.x = SYMBOL_SIZE / 2;
      valueText.y = SYMBOL_SIZE / 2;
      valueText.visible = false;
      cellContainer.addChild(valueText);

      bonusContainer.addChild(cellContainer);
      bonusCells.push({
        col, row, container: cellContainer,
        reelSet: cellReelSet,
        locked: false, value: 0,
        bg, valueText,
      });
    }
  }

  const bonusFrame = new Graphics();
  bonusFrame.roundRect(-10, -10, totalWidth + 20, totalHeight + 20, 8);
  bonusFrame.stroke({ color: 0xffd700, width: 3 });
  bonusContainer.addChildAt(bonusFrame, 0);

  const ui = createUI({
    onSpin: () => handleSpin(),
    onSpeedChange: (s) => mainReelSet.setSpeed(s),
    speeds: ['normal', 'turbo', 'superTurbo'],
  });

  let isSpinning = false;
  let inBonus = false;

  function mockMainSpin(): Promise<{ symbols: string[][]; bonusCount: number }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const symbols: string[][] = [];
        let bonusCount = 0;
        for (let r = 0; r < REEL_COUNT; r++) {
          const col: string[] = [];
          for (let row = 0; row < VISIBLE_ROWS; row++) {
            const rand = Math.random();
            let sym: string;
            if (rand < 0.08) { sym = 'bonus'; bonusCount++; }
            else if (rand < 0.12) sym = 'wild';
            else if (rand < 0.20) sym = 'high1';
            else if (rand < 0.28) sym = 'high2';
            else if (rand < 0.40) sym = 'med1';
            else if (rand < 0.52) sym = 'med2';
            else if (rand < 0.64) sym = 'low1';
            else if (rand < 0.76) sym = 'low2';
            else if (rand < 0.88) sym = 'low3';
            else sym = 'low4';
            col.push(sym);
          }
          symbols.push(col);
        }
        resolve({ symbols, bonusCount });
      }, 300);
    });
  }

  async function handleSpin() {
    if (isSpinning) { try { mainReelSet.skip(); } catch {} return; }
    if (inBonus) return;

    isSpinning = true;
    ui.setSpinning(true);
    ui.showWin(0);
    statusEl.textContent = '';

    const spinPromise = mainReelSet.spin();
    const result = await mockMainSpin();
    mainReelSet.setResult(result.symbols);
    await spinPromise;

    isSpinning = false;
    ui.setSpinning(false);

    if (result.bonusCount >= 3) {
      const positions: { reelIndex: number; rowIndex: number }[] = [];
      for (let r = 0; r < REEL_COUNT; r++) {
        for (let row = 0; row < VISIBLE_ROWS; row++) {
          if (result.symbols[r][row] === 'bonus') positions.push({ reelIndex: r, rowIndex: row });
        }
      }
      await mainReelSet.spotlight.show(positions);
      statusEl.textContent = `BONUS! (${result.bonusCount} coins)`;
      await wait(1500);
      mainReelSet.spotlight.hide();
      await runBonus();
    }
  }

  async function runBonus() {
    inBonus = true;
    mainReelSet.visible = false;
    bonusContainer.visible = true;

    for (const cell of bonusCells) {
      cell.locked = false;
      cell.value = 0;
      cell.valueText.visible = false;
      cell.valueText.text = '';
      cell.bg.clear();
      cell.bg.roundRect(0, 0, SYMBOL_SIZE, SYMBOL_SIZE, 10);
      cell.bg.fill({ color: 0x1a1a3e });
      cell.bg.stroke({ color: 0x333366, width: 1 });
      cell.reelSet!.visible = false;
    }

    let respins = 3;
    let totalWin = 0;

    while (respins > 0) {
      statusEl.textContent = `HOLD & WIN — Respins: ${respins}`;

      const freeCells = bonusCells.filter((c) => !c.locked);
      if (freeCells.length === 0) break;

      const spinPromises: Promise<unknown>[] = [];
      for (const cell of freeCells) {
        cell.reelSet!.visible = true;
        cell.valueText.visible = false;
        const sp = cell.reelSet!.spin();
        spinPromises.push(sp);
      }

      await wait(200);

      const landResults: { cell: BonusCell; lands: boolean; value: number }[] = [];
      for (const cell of freeCells) {
        const lands = Math.random() < 0.28;
        const value = lands ? BONUS_VALUES[Math.floor(Math.random() * BONUS_VALUES.length)] : 0;
        landResults.push({ cell, lands, value });
        cell.reelSet!.setResult([['bonus']]);
      }

      await Promise.all(spinPromises);

      let newLands = 0;
      for (const { cell, lands, value } of landResults) {
        if (lands) {
          newLands++;
          cell.locked = true;
          cell.value = value;
          totalWin += value;

          cell.bg.clear();
          cell.bg.roundRect(0, 0, SYMBOL_SIZE, SYMBOL_SIZE, 10);
          cell.bg.fill({ color: 0x2a1a3e });
          cell.bg.roundRect(3, 3, SYMBOL_SIZE - 6, SYMBOL_SIZE - 6, 8);
          cell.bg.stroke({ color: 0xffd700, width: 2 });

          cell.valueText.text = `${value}x`;
          cell.valueText.visible = true;
          cell.valueText.scale.set(0);
          gsap.to(cell.valueText.scale, {
            x: 1, y: 1,
            duration: 0.3,
            ease: 'back.out(2)',
          });
        } else {
          cell.reelSet!.visible = false;
        }
      }

      ui.showWin(totalWin);

      if (newLands > 0) {
        respins = 3;
        statusEl.textContent = `+${newLands} COINS! Respins reset to 3`;
        await wait(800);
      } else {
        respins--;
        await wait(400);
      }
    }

    const allLocked = bonusCells.every((c) => c.locked);
    if (allLocked) {
      totalWin *= 5;
      statusEl.textContent = `GRAND JACKPOT! WIN: ${totalWin}x`;
      for (const cell of bonusCells) {
        gsap.to(cell.bg, { alpha: 0.5, duration: 0.15, yoyo: true, repeat: 5 });
      }
    } else {
      statusEl.textContent = `BONUS COMPLETE — WIN: ${totalWin}x`;
    }
    ui.showWin(totalWin);
    await wait(3000);

    for (const cell of bonusCells) {
      cell.reelSet!.visible = false;
    }

    bonusContainer.visible = false;
    mainReelSet.visible = true;
    statusEl.textContent = '';
    inBonus = false;
  }

  function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

  window.addEventListener('resize', () => {
    mainReelSet.x = centerX();
    mainReelSet.y = centerY();
    bonusContainer.x = centerX();
    bonusContainer.y = centerY();
  });
}

main().catch(console.error);
