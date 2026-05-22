import { Application, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  WinPresenter,
  enableDebug,
} from 'pixi-reels';
import type { Win, SymbolPosition } from 'pixi-reels';
import { CardSymbol, CARD_DECK, WILD_CARD } from '../../shared/CardSymbol.js';
import { WinBox } from '../../shared/WinBox.js';
import { roundBus } from '../../shared/roundBus.js';
import { mountUiOverlay, type UiOverlay } from '../../shared/uiOverlay.js';

const REEL_COUNT = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 540;
const SYMBOL_WIDTH = 110;
const SPIN_SYMBOL_HEIGHT = 110;
const SYMBOL_GAP = 4;

const PAYS: Record<string, number> = {
  '7': 6, '8': 8, '9': 10, '10': 14, J: 18, Q: 22, K: 28, A: 35, wild: 40,
};

interface WaysWin { cells: SymbolPosition[]; symbolId: string; amount: number; length: number; }

export interface BootOptions {
  host: HTMLElement;
  fullScreen?: boolean;
  showSpeeds?: boolean;
}

export async function boot(opts: BootOptions): Promise<() => void> {
  const { host, fullScreen = false } = opts;
  const showSpeeds = opts.showSpeeds ?? fullScreen;

  const app = new Application();
  await app.init({
    background: 0x0e1f2a,
    antialias: true,
    ...(fullScreen ? { resizeTo: window } : { resizeTo: host }),
  });
  host.appendChild(app.canvas);

  gsap.ticker.remove(gsap.updateRoot);
  const gsapDriver = (): void => gsap.updateRoot(app.ticker.lastTime / 1000);
  app.ticker.add(gsapDriver);

  const winBox = new WinBox({
    tickupSeconds: 1.4,
    anchor: 'top',
    mountTo: fullScreen ? document.body : host,
  });

  const reelSet = new ReelSetBuilder()
    .reels(REEL_COUNT)
    .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
    .symbolSize(SYMBOL_WIDTH, SPIN_SYMBOL_HEIGHT)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      for (const c of CARD_DECK) {
        r.register(c.id, CardSymbol, { color: c.color, label: c.label });
      }
      r.register(WILD_CARD.id, CardSymbol, {
        color: WILD_CARD.color,
        label: WILD_CARD.label,
        textColor: WILD_CARD.textColor,
      });
    })
    .weights({ '7': 18, '8': 16, '9': 14, '10': 12, J: 10, Q: 8, K: 6, A: 5, wild: 3 })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .pinMigrationDuration(220)
    .pinMigrationEase('power2.inOut')
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  const totalWidth = REEL_COUNT * (SYMBOL_WIDTH + SYMBOL_GAP) - SYMBOL_GAP;
  const totalHeight = REEL_PIXEL_HEIGHT;
  const wrapper = new Container();
  wrapper.addChild(reelSet);
  app.stage.addChild(wrapper);

  function reposition(): void {
    const pad = 16, uiH = fullScreen ? 100 : 80;
    const s = Math.min(
      (app.screen.width - pad * 2) / totalWidth,
      (app.screen.height - pad * 2 - uiH) / totalHeight,
      1,
    );
    wrapper.scale.set(s);
    wrapper.x = (app.screen.width - totalWidth * s) / 2;
    wrapper.y = (app.screen.height - totalHeight * s - uiH) / 2;
  }

  const frame = new Graphics();
  frame.roundRect(-12, -12, totalWidth + 24, totalHeight + 24, 12);
  frame.stroke({ color: 0x7ed6c8, width: 3, alpha: 0.85 });
  reelSet.addChildAt(frame, 0);

  // Per-page WAYS counter — rendered as an inline DOM element above the
  // canvas. Lives inside the host so embedded site demos don't pollute body.
  const waysEl = document.createElement('div');
  waysEl.style.cssText =
    `${fullScreen ? 'position:fixed;bottom:62px' : 'position:absolute;bottom:42px'};` +
    'left:50%;transform:translateX(-50%);font-family:"Roboto Condensed",sans-serif;' +
    'font-weight:700;letter-spacing:0.12em;color:#ffd700;font-size:18px;' +
    'z-index:1000;text-shadow:0 2px 6px rgba(0,0,0,0.6);pointer-events:none;';
  host.appendChild(waysEl);

  const presenter = new WinPresenter(reelSet, {
    dimLosers: { alpha: 0.28 },
    cycleGap: 350,
    cycles: 2,
  });

  const ui: UiOverlay = mountUiOverlay({
    host: fullScreen ? document.body : host,
    fullScreen,
    showSpeeds,
    onSpin: () => handleSpin(),
    onSpeedChange: (s) => reelSet.setSpeed(s),
  });

  let isSpinning = false;
  let disposed = false;

  async function handleSpin(): Promise<void> {
    if (disposed) return;
    if (isSpinning) {
      try { reelSet.skipSpin(); } catch { /* idle */ }
      return;
    }
    isSpinning = true;
    ui.setSpinning(true);
    presenter.abort();
    roundBus.emit('round:reset');
    ui.setStatus('');
    waysEl.textContent = '';

    const shape = rollShape();
    const ways = shape.reduce((p, n) => p * n, 1);

    const spinPromise = reelSet.spin();
    reelSet.setShape(shape);
    const result = mockSpin(shape);
    reelSet.setResult(result.grid.map((visible) => ({ visible })));
    await spinPromise;
    if (disposed) return;

    waysEl.textContent = `${ways.toLocaleString()} WAYS`;

    isSpinning = false;
    ui.setSpinning(false);

    if (result.wins.length > 0) {
      const total = result.wins.reduce((s, w) => s + w.amount, 0);
      roundBus.emit('win:set', total);
      ui.setStatus(
        result.wins
          .map((w) => `${w.length}-of-a-kind ${w.symbolId.toUpperCase()} ${w.amount}`)
          .join('   /   '),
      );

      const wins: Win[] = result.wins.map((w, i) => ({
        cells: w.cells,
        value: w.amount,
        kind: w.symbolId,
        id: i,
      }));
      await presenter.show(wins);
    }
  }

  reposition();
  if (fullScreen) window.addEventListener('resize', reposition);
  const ro = !fullScreen && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => reposition())
    : null;
  if (ro) ro.observe(host);

  return (): void => {
    if (disposed) return;
    disposed = true;
    if (fullScreen) window.removeEventListener('resize', reposition);
    if (ro) ro.disconnect();
    presenter.destroy();
    waysEl.remove();
    ui.destroy();
    winBox.destroy();
    app.ticker.remove(gsapDriver);
    app.destroy(true, { children: true });
  };
}

function rollShape(): number[] {
  const shape: number[] = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const range = MAX_ROWS - MIN_ROWS + 1;
    const a = Math.floor(Math.random() * range);
    const b = Math.floor(Math.random() * range);
    shape.push(MIN_ROWS + Math.max(a, b));
  }
  return shape;
}

function mockSpin(shape: number[]): { grid: string[][]; wins: WaysWin[] } {
  const grid: string[][] = [];
  for (let c = 0; c < REEL_COUNT; c++) {
    const col: string[] = [];
    for (let r = 0; r < shape[c]; r++) col.push(randomCard());
    grid.push(col);
  }
  return { grid, wins: evaluateWays(grid) };
}

function randomCard(): string {
  const r = Math.random();
  if (r < 0.04) return 'wild';
  if (r < 0.10) return 'A';
  if (r < 0.18) return 'K';
  if (r < 0.28) return 'Q';
  if (r < 0.40) return 'J';
  if (r < 0.54) return '10';
  if (r < 0.68) return '9';
  if (r < 0.84) return '8';
  return '7';
}

function evaluateWays(grid: string[][]): WaysWin[] {
  const kinds = new Set<string>();
  for (const col of grid) for (const s of col) if (s !== 'wild') kinds.add(s);

  const wins: WaysWin[] = [];
  for (const kind of kinds) {
    const cellsByReel: SymbolPosition[][] = [];
    let chain = 0;
    for (let c = 0; c < REEL_COUNT; c++) {
      const matches: SymbolPosition[] = [];
      for (let r = 0; r < grid[c].length; r++) {
        const s = grid[c][r];
        if (s === kind || s === 'wild') matches.push({ reelIndex: c, rowIndex: r });
      }
      if (matches.length === 0) break;
      cellsByReel.push(matches);
      chain++;
    }
    if (chain < 3) continue;

    let ways = 1;
    const cells: SymbolPosition[] = [];
    for (let i = 0; i < chain; i++) {
      ways *= cellsByReel[i].length;
      cells.push(...cellsByReel[i]);
    }
    const baseLine = (PAYS[kind] ?? 5) * chain;
    wins.push({ cells, symbolId: kind, amount: baseLine * ways, length: chain });
  }
  wins.sort((a, b) => b.amount - a.amount);
  return wins;
}
