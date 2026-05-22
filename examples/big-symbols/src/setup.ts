import { Application, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  WinPresenter,
  enableDebug,
} from 'pixi-reels';
import { SpineReelSymbol } from 'pixi-reels/spine';
import type { Win, SymbolPosition, ReelSet } from 'pixi-reels';
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
  '9': 'low_a',
  '10': 'low_k',
  J: 'low_q',
  Q: 'low_j',
  K: 'mid_1',
  A: 'high_1',
  wild: 'wild',
  bigWild: 'wild',
};
const SYMBOL_IDS = Object.keys(SPINE_MAP);

const REEL_COUNT = 5;
const VISIBLE_ROWS = 4;
// 140 = the generated spines' authored frame size — matches the bake
// so frame strokes stay crisp and the wild's 200 px W overflows by the
// intended 60 px (~30 px each side past the frame border).
const SYMBOL_SIZE = 140;
const SYMBOL_GAP = 6;

const PAYS: Record<string, number> = {
  '9': 5, '10': 5, J: 8, Q: 12, K: 16, A: 20, wild: 25, bigWild: 25,
};

interface WinResult { cells: SymbolPosition[]; symbolId: string; amount: number; }

export interface BootOptions {
  /** Where the canvas + overlay UI mount. */
  host: HTMLElement;
  /** When true, canvas resizes to window. Default: false (fits to host). */
  fullScreen?: boolean;
  /** Speed-button row visible? Default: same as fullScreen. */
  showSpeeds?: boolean;
}

/**
 * Boot the big-symbols demo against an arbitrary host element. Returns a
 * cleanup function that disposes the PIXI application, the round-bus
 * subscriptions, and the overlay UI. The function is the same boot used
 * by the standalone `main.ts` and the embedded site demo card.
 */
export async function boot(opts: BootOptions): Promise<() => void> {
  const { host, fullScreen = false } = opts;
  const showSpeeds = opts.showSpeeds ?? fullScreen;

  const app = new Application();
  await app.init({
    background: 0x1a1530,
    antialias: true,
    ...(fullScreen ? { resizeTo: window } : { resizeTo: host }),
  });
  host.appendChild(app.canvas);

  await loadGeneratedSpines();

  gsap.ticker.remove(gsap.updateRoot);
  const gsapDriver = (): void => gsap.updateRoot(app.ticker.lastTime / 1000);
  app.ticker.add(gsapDriver);

  const winBox = new WinBox({
    tickupSeconds: 1.2,
    anchor: 'top',
    mountTo: fullScreen ? document.body : host,
  });

  const reelSet = new ReelSetBuilder()
    .reels(REEL_COUNT)
    .visibleRows(VISIBLE_ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      const spineMap = buildSpineMap(SPINE_MAP);
      for (const id of SYMBOL_IDS) {
        r.register(id, SpineReelSymbol, {
          spineMap,
          autoPlayLanding: true,
          // bigWild occupies a 2x2 block — render the spine at 2x scale
          // so the rig fills the block instead of sitting tiny in the
          // top-left cell with empty space around it.
          scale: id === 'bigWild' ? 2 : 1,
        });
      }
    })
    .weights({
      '9': 18, '10': 18,
      J: 14, Q: 12, K: 10, A: 8,
      wild: 4,
      // Big symbols MUST have weight 0 — they're placed by the server only.
      bigWild: 0,
    })
    .symbolData({
      // Wild + bigWild use a 200 px icon attachment that overflows the
      // 140 px frame. zIndex 999/1000 keeps the overflowing W painted
      // ABOVE every neighbouring tile's frame.
      bigWild: { size: { w: 2, h: 2 }, weight: 0, zIndex: 1000 },
      wild: { zIndex: 999 },
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
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
  const totalHeight = VISIBLE_ROWS * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const wrapper = new Container();
  wrapper.addChild(reelSet);
  app.stage.addChild(wrapper);

  function reposition(): void {
    const pad = 16, uiH = fullScreen ? 90 : 60;
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
  frame.stroke({ color: 0xa29bfe, width: 3, alpha: 0.85 });
  reelSet.addChildAt(frame, 0);

  const presenter = new WinPresenter(reelSet, {
    dimLosers: { alpha: 0.28 },
    cycleGap: 350,
    stagger: 60,
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
  let spinCount = 0;
  let disposed = false;

  async function handleSpin(): Promise<void> {
    if (disposed) return;
    if (isSpinning) {
      try { reelSet.skip(); } catch { /* idle */ }
      return;
    }
    isSpinning = true;
    ui.setSpinning(true);
    presenter.abort();
    roundBus.emit('round:reset');
    ui.setStatus('');

    const spinPromise = reelSet.spin();
    const result = await mockSpin(++spinCount);
    if (disposed) return;
    reelSet.setResult(result.grid.map((visible) => ({ visible })));
    await spinPromise;
    if (disposed) return;

    isSpinning = false;
    ui.setSpinning(false);

    if (result.wins.length > 0) {
      const total = result.wins.reduce((s, w) => s + w.amount, 0);
      roundBus.emit('win:set', total);
      ui.setStatus(
        result.wins
          .map((w) => `${w.cells.length}x ${w.symbolId.toUpperCase()} ${w.amount}`)
          .join('   /   '),
      );

      const wins: Win[] = result.wins.map((w, i) => ({
        cells: w.cells,
        value: w.amount,
        kind: w.symbolId,
        id: i,
      }));
      await presenter.show(wins);
    } else {
      ui.setStatus('');
    }
  }

  reposition();
  if (fullScreen) window.addEventListener('resize', reposition);
  // Fit-to-host mode: re-layout when the host element resizes.
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
    ui.destroy();
    winBox.destroy();
    app.ticker.remove(gsapDriver);
    cleanupReelSet(reelSet);
    app.destroy(true, { children: true });
  };
}

function cleanupReelSet(reelSet: ReelSet): void {
  // ReelSet doesn't expose a public destroy; removing its display-list parent
  // is enough for the embedded path because the whole PIXI app is torn down.
  void reelSet;
}

function mockSpin(spinIndex: number): Promise<{ grid: string[][]; wins: WinResult[] }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const grid: string[][] = [];
      for (let r = 0; r < REEL_COUNT; r++) {
        const col: string[] = [];
        for (let row = 0; row < VISIBLE_ROWS; row++) col.push(randomCard());
        grid.push(col);
      }
      const dropBig = spinIndex % 3 === 0 || Math.random() < 0.18;
      if (dropBig) {
        const anchorCol = 1 + Math.floor(Math.random() * 3);
        const anchorRow = Math.floor(Math.random() * (VISIBLE_ROWS - 1));
        grid[anchorCol][anchorRow] = 'bigWild';
        grid[anchorCol][anchorRow + 1] = '_';
        if (anchorCol + 1 < REEL_COUNT) {
          grid[anchorCol + 1][anchorRow] = '_';
          grid[anchorCol + 1][anchorRow + 1] = '_';
        }
      }

      // Resolve OCCUPIED stubs to the anchor's id for client-side win
      // evaluation. The engine does its own resolution server-side; we
      // mirror it here only because PAYS needs to see the real id.
      const resolved: string[][] = grid.map((col) => [...col]);
      for (let c = 0; c < REEL_COUNT; c++) {
        for (let row = 0; row < VISIBLE_ROWS; row++) {
          if (resolved[c][row] === '_') {
            let aR = row, aC = c;
            while (aR > 0 && resolved[aC][aR] === '_') aR--;
            while (aC > 0 && resolved[aC][aR] === '_') aC--;
            resolved[c][row] = resolved[aC][aR];
          }
        }
      }
      resolve({ grid, wins: evaluateWins(resolved) });
    }, 250);
  });
}

function randomCard(): string {
  const r = Math.random();
  if (r < 0.04) return 'wild';
  if (r < 0.13) return 'A';
  if (r < 0.24) return 'K';
  if (r < 0.37) return 'Q';
  if (r < 0.52) return 'J';
  if (r < 0.76) return '10';
  return '9';
}

function evaluateWins(grid: string[][]): WinResult[] {
  const wins: WinResult[] = [];
  for (let row = 0; row < VISIBLE_ROWS; row++) {
    const first = grid[0][row];
    let target = first;
    if (target === 'wild' || target === 'bigWild') {
      for (let c = 1; c < REEL_COUNT; c++) {
        const s = grid[c][row];
        if (s !== 'wild' && s !== 'bigWild') { target = s; break; }
      }
    }
    let count = 0;
    const cells: SymbolPosition[] = [];
    for (let c = 0; c < REEL_COUNT; c++) {
      const s = grid[c][row];
      if (s === target || s === 'wild' || s === 'bigWild') {
        count++;
        cells.push({ reelIndex: c, rowIndex: row });
      } else break;
    }
    if (count >= 3) {
      wins.push({ cells, symbolId: target, amount: (PAYS[target] ?? 5) * count });
    }
  }
  return wins;
}
