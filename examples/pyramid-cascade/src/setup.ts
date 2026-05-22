import { Application, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
} from 'pixi-reels';
import { SpineReelSymbol } from 'pixi-reels/spine';
import type { SymbolPosition } from 'pixi-reels';
import { WinBox } from '../../shared/WinBox.js';
import { roundBus } from '../../shared/roundBus.js';
import { mountUiOverlay, type UiOverlay } from '../../shared/uiOverlay.js';
import {
  loadGeneratedSpines,
  buildSpineMap,
  type GeneratedSpineName,
} from '../../shared/generatedSpineLoader.js';

/** Symbol IDs in use here mapped to generated spine skeletons. */
const SPINE_MAP: Record<string, GeneratedSpineName> = {
  '7': 'low_a',
  '8': 'low_k',
  '9': 'low_q',
  '10': 'low_j',
  J: 'mid_1',
  Q: 'mid_2',
  K: 'mid_3',
  A: 'high_1',
  wild: 'wild',
};
const SYMBOL_IDS = Object.keys(SPINE_MAP);

const REEL_COUNT = 5;
const ROWS_PER_REEL = [3, 5, 5, 5, 3];
const MAX_ROWS = Math.max(...ROWS_PER_REEL);
// 140 = the generated spines' authored frame size — matches the bake
// so frame strokes stay crisp.
const SYMBOL_SIZE = 140;
const SYMBOL_GAP = 4;

/** Per-reel row offset to convert local-row to global-row (center anchor). */
const ROW_OFFSET = ROWS_PER_REEL.map((rows) => Math.floor((MAX_ROWS - rows) / 2));

const PAYS: Record<string, number> = { '7': 4, '8': 6, '9': 8, '10': 10, J: 14, Q: 18, K: 24, A: 32 };

interface WaysWin { cells: SymbolPosition[]; symbolId: string; amount: number; chain: number; }

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
    background: 0x1c0d2b,
    antialias: true,
    ...(fullScreen ? { resizeTo: window } : { resizeTo: host }),
  });
  host.appendChild(app.canvas);

  await loadGeneratedSpines();

  gsap.ticker.remove(gsap.updateRoot);
  const gsapDriver = (): void => gsap.updateRoot(app.ticker.lastTime / 1000);
  app.ticker.add(gsapDriver);

  const winBox = new WinBox({
    tickupSeconds: 0.9,
    anchor: 'top',
    mountTo: fullScreen ? document.body : host,
  });

  const reelSet = new ReelSetBuilder()
    .reels(REEL_COUNT)
    .visibleRowsPerReel(ROWS_PER_REEL)
    .reelAnchor('center')
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      const spineMap = buildSpineMap(SPINE_MAP);
      for (const id of SYMBOL_IDS) {
        r.register(id, SpineReelSymbol, {
          spineMap,
          autoPlayLanding: true,
        });
      }
    })
    .weights({ '7': 18, '8': 16, '9': 14, '10': 12, J: 10, Q: 8, K: 7, A: 5, wild: 2 })
    // Wild's icon attachment is 200 px — overflows the 140 px frame.
    // High zIndex keeps the W painted above neighbouring tiles.
    .symbolData({ wild: { zIndex: 999 } })
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 130 })
    .speed('turbo', { ...SpeedPresets.TURBO, stopDelay: 70 })
    .speed('superTurbo', { ...SpeedPresets.SUPER_TURBO, stopDelay: 0 })
    // Stiff drop — no bounce on land. The bouncy default fights the win
    // animation when it arrives a frame later.
    .tumble({
      fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
      dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
    })
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  // Sync idle across every spine symbol once the spin fully completes.
  // Reels touch down staggered, so per-symbol idle would also start
  // staggered. After spin:complete + a short wait for landing one-shots
  // to finish, restart idle on every visible symbol so the breathing
  // loops are time-aligned across the whole grid.
  const LANDING_MS = 350;
  function syncIdle(): void {
    for (let r = 0; r < reelSet.reelCount; r++) {
      const reel = reelSet.getReel(r);
      for (let row = 0; row < reel.visibleRows; row++) {
        const sym = reel.getSymbolAt(row);
        if (sym instanceof SpineReelSymbol) sym.stopAnimation();
      }
    }
  }
  reelSet.events.on('spin:complete', () => {
    setTimeout(syncIdle, LANDING_MS);
  });

  const totalWidth = REEL_COUNT * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const totalHeight = MAX_ROWS * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
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
  drawDiamondFrame(frame);
  reelSet.addChildAt(frame, 0);

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
      try { reelSet.skip(); } catch { /* idle */ }
      return;
    }
    isSpinning = true;
    ui.setSpinning(true);
    roundBus.emit('round:reset');
    ui.setStatus('');

    const spinPromise = reelSet.spin();
    reelSet.setDropOrder('ltr');
    let grid = randomGrid();
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await spinPromise;
    if (disposed) return;

    // Cascade chain — `reelSet.runCascade` owns detect → destroy → refill.
    // We supply the game rules (ways evaluation + gravity-correct nextGrid)
    // and use `onCascade` for the round-side-effects (status text, win
    // bus, multiplier bump). Same canonical orchestrator every cascade
    // recipe and the cascade-tumble example use.
    let cascadeLevel = 0;
    let totalWin = 0;
    let lastWinsForUi: WaysWin[] = [];
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: (g) => {
        const wins = evaluateWays(g);
        lastWinsForUi = wins;
        if (wins.length === 0) return [];
        return dedupeCells(wins.flatMap((w) => w.cells))
          .map((c) => ({ reel: c.reelIndex, row: c.rowIndex }));
      },
      nextGrid: (prev, winners) => {
        const cells: SymbolPosition[] = winners.map((w) => ({ reelIndex: w.reel, rowIndex: w.row }));
        return computeRefillGrid(prev, cells);
      },
      onCascade: ({ chain }) => {
        cascadeLevel = chain;
        const multi = chain;
        const wins = lastWinsForUi;
        const roundWin = wins.reduce((s, w) => s + w.amount * multi, 0);
        totalWin += roundWin;
        ui.setStatus(
          chain === 1
            ? `${wins.length} WAY${wins.length > 1 ? 'S' : ''} WIN`
            : `CASCADE x${multi} - ${wins.length} WAY${wins.length > 1 ? 'S' : ''}`,
        );
        roundBus.emit('win:add', roundWin);
      },
      pauseAfterDestroyMs: 120,
    });

    if (cascadeLevel === 0) ui.setStatus('');
    else if (totalWin > 0) ui.setStatus(`${cascadeLevel} CASCADE${cascadeLevel > 1 ? 'S' : ''} - ${totalWin} TOTAL`);

    isSpinning = false;
    ui.setSpinning(false);
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
    ui.destroy();
    winBox.destroy();
    app.ticker.remove(gsapDriver);
    app.destroy(true, { children: true });
  };
}

function drawDiamondFrame(g: Graphics): void {
  for (let c = 0; c < REEL_COUNT; c++) {
    const rows = ROWS_PER_REEL[c];
    const offset = ROW_OFFSET[c];
    const x = c * (SYMBOL_SIZE + SYMBOL_GAP);
    const y = offset * (SYMBOL_SIZE + SYMBOL_GAP);
    const w = SYMBOL_SIZE;
    const h = rows * SYMBOL_SIZE + (rows - 1) * SYMBOL_GAP;
    g.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
  }
  g.stroke({ color: 0xffb347, width: 2.5, alpha: 0.85 });
}

function randomCard(): string {
  const r = Math.random();
  if (r < 0.03) return 'wild';
  if (r < 0.10) return 'A';
  if (r < 0.18) return 'K';
  if (r < 0.28) return 'Q';
  if (r < 0.40) return 'J';
  if (r < 0.54) return '10';
  if (r < 0.68) return '9';
  if (r < 0.84) return '8';
  return '7';
}

function randomGrid(): string[][] {
  return ROWS_PER_REEL.map((rows) =>
    Array.from({ length: rows }, randomCard),
  );
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
    wins.push({ cells, symbolId: kind, amount: baseLine * ways, chain });
  }
  wins.sort((a, b) => b.amount - a.amount);
  return wins;
}

function dedupeCells(cells: SymbolPosition[]): SymbolPosition[] {
  const seen = new Set<string>();
  const out: SymbolPosition[] = [];
  for (const c of cells) {
    const k = `${c.reelIndex}:${c.rowIndex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function computeRefillGrid(currentGrid: string[][], removed: SymbolPosition[]): string[][] {
  const grid = currentGrid.map((col) => [...col]);
  const removedByReel = new Map<number, Set<number>>();
  for (const p of removed) {
    if (!removedByReel.has(p.reelIndex)) removedByReel.set(p.reelIndex, new Set());
    removedByReel.get(p.reelIndex)!.add(p.rowIndex);
  }
  for (let c = 0; c < REEL_COUNT; c++) {
    const rem = removedByReel.get(c);
    if (!rem || rem.size === 0) continue;
    const survivors = grid[c].filter((_, row) => !rem.has(row));
    const newSyms = Array.from({ length: ROWS_PER_REEL[c] - survivors.length }, randomCard);
    grid[c] = [...newSyms, ...survivors];
  }
  return grid;
}
