import { Application, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
  type Cell,
  type ReelSet,
} from 'pixi-reels';
import { SpineReelSymbol } from 'pixi-reels/spine';

import {
  SYMBOL_IDS,
  loadArcLordSpines, buildArcLordSpineMap,
} from './spineAssets.js';
import {
  audio, loadAllSounds,
  sfx, startAmbient, startReelSpinLoop, stopReelSpinLoop,
} from './audio.js';

// ------------------------------------------------------------
// LAYOUT
// ------------------------------------------------------------

const REELS = 6;
const ROWS = 5;
const CELL = 110;
const GAP = 6;

const LEAD_IN_MS = 180;
const PAUSE_AFTER_REMOVAL_MS = 280;

// ------------------------------------------------------------
// MOCK SERVER
// ------------------------------------------------------------

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickWeighted(): string {
  const r = Math.random();
  if (r < 0.03) return '0';
  if (r < 0.18) return SYMBOL_IDS[6 + Math.floor(Math.random() * 4)]!;
  return SYMBOL_IDS[1 + Math.floor(Math.random() * 5)]!;
}

function randomGrid(): string[][] {
  return Array.from({ length: REELS }, () =>
    Array.from({ length: ROWS }, pickWeighted),
  );
}

const mockServer = {
  async spin(): Promise<string[][]> {
    await wait(400 + Math.random() * 400);
    return randomGrid();
  },
  async cascade(prev: string[][], winners: Cell[]): Promise<string[][]> {
    await wait(120 + Math.random() * 120);
    const next = prev.map((c) => [...c]);
    const byReel = new Map<number, Set<number>>();
    for (const w of winners) {
      const s = byReel.get(w.reel) ?? new Set<number>();
      s.add(w.row);
      byReel.set(w.reel, s);
    }
    for (let r = 0; r < REELS; r++) {
      const losers = byReel.get(r);
      if (!losers || losers.size === 0) continue;
      const survivors = next[r].filter((_, row) => !losers.has(row));
      const fillers = Array.from({ length: losers.size }, pickWeighted);
      next[r] = [...fillers, ...survivors];
    }
    return next;
  },
};

function detectWinners(grid: string[][]): Cell[] {
  const winners: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    const head = grid[0][row];
    let run = 1;
    for (let r = 1; r < REELS; r++) {
      if (grid[r][row] === head) run++;
      else break;
    }
    if (run >= 3) {
      for (let r = 0; r < run; r++) winners.push({ reel: r, row });
    }
  }
  return winners;
}

async function destroyWinners(reelSet: ReelSet, winners: Cell[]): Promise<void> {
  if (winners.length === 0) return;
  reelSet.viewport.showDim(0.35);
  sfx('destroy', { volume: 0.9 });
  await Promise.all(winners.map((w, i) => {
    const view = reelSet.reels[w.reel].getSymbolAt(w.row).view;
    view.zIndex = 1000;
    const dir = w.reel % 2 === 0 ? 1 : -1;
    return new Promise<void>((resolve) => {
      gsap.timeline({ onComplete: () => resolve(), delay: i * 0.015 })
        .to(view.scale, { x: 1.25, y: 1.25, duration: 0.08, ease: 'back.out(2.5)' })
        .to(view, { rotation: dir * 0.8, alpha: 0, duration: 0.24, ease: 'power2.in' }, '<+=0.05')
        .to(view.scale, { x: 0, y: 0, duration: 0.24, ease: 'power2.in' }, '<');
    });
  }));
  reelSet.viewport.hideDim();
}

// ------------------------------------------------------------
// PUBLIC BOOT — same shape as other examples so the docs-site demo
// component can mount this game inside DemoSandbox.
// ------------------------------------------------------------

export interface BootOptions {
  host: HTMLElement;
  /** When true, sizes the canvas to the window; otherwise to `host`. */
  fullScreen?: boolean;
  /** Where to fetch sound + spine assets from. */
  assetsBase?: string;
  /** DOM elements for HUD readout. If omitted, no HUD. */
  hud?: { winEl?: HTMLElement; multEl?: HTMLElement; statusEl?: HTMLElement };
}

export async function boot(opts: BootOptions): Promise<() => void> {
  const { host, fullScreen = false } = opts;
  const assetsBase = opts.assetsBase ?? '/arc-lord/';

  const app = new Application();
  await app.init({
    background: 0x0a0518,
    antialias: true,
    ...(fullScreen ? { resizeTo: window } : { resizeTo: host }),
  });
  host.appendChild(app.canvas);

  gsap.ticker.remove(gsap.updateRoot);
  const gsapDriver = (): void => gsap.updateRoot(app.ticker.lastTime / 1000);
  app.ticker.add(gsapDriver);

  // Load spine + audio in parallel; both gate the first spin.
  await Promise.all([
    loadArcLordSpines(`${assetsBase}spine/`),
    loadAllSounds(`${assetsBase}sound/`),
  ]);

  const spineMap = buildArcLordSpineMap();

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleSymbols(ROWS)
    .symbolSize(CELL, CELL)
    .symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const id of SYMBOL_IDS) {
        r.register(id, SpineReelSymbol, { spineMap, autoPlayLanding: true, scale: 0.45 });
      }
    })
    .weights({ '0': 3, '1': 18, '2': 18, '3': 18, '4': 18, '5': 18, '6': 10, '7': 10, '8': 10, '9': 10 })
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 80, spinDelay: 60 })
    .tumble({
      fall:   { duration: 280, ease: 'sine.in',       rowStagger: 50 },
      dropIn: { duration: 440, ease: 'back.out(1.4)', rowStagger: 0,  distance: 'perHole' },
    })
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  reelSet.events.on('cascade:fall:start', ({ reelIndex }) => {
    if (reelIndex === 0) startReelSpinLoop();
  });
  reelSet.events.on('cascade:dropIn:end', ({ reelIndex }) => {
    sfx('reelStop', { volume: 0.45 });
    if (reelIndex === REELS - 1) stopReelSpinLoop();
  });

  const totalW = REELS * (CELL + GAP) - GAP;
  const totalH = ROWS * (CELL + GAP) - GAP;
  const wrapper = new Container();
  wrapper.addChild(reelSet);

  const frame = new Graphics();
  frame.roundRect(-12, -12, totalW + 24, totalH + 24, 14);
  frame.stroke({ color: 0xffd166, width: 2.5, alpha: 0.55 });
  frame.roundRect(-6, -6, totalW + 12, totalH + 12, 10);
  frame.stroke({ color: 0xffd166, width: 1, alpha: 0.25 });
  reelSet.addChildAt(frame, 0);

  app.stage.addChild(wrapper);

  function reposition(): void {
    const pad = 16, uiH = 80;
    const s = Math.min(
      (app.screen.width - pad * 2) / totalW,
      (app.screen.height - pad * 2 - uiH) / totalH,
      1,
    );
    wrapper.scale.set(s);
    wrapper.x = (app.screen.width - totalW * s) / 2;
    wrapper.y = (app.screen.height - totalH * s - uiH) / 2;
  }
  reposition();
  if (fullScreen) window.addEventListener('resize', reposition);
  const ro = !fullScreen && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => reposition())
    : null;
  if (ro) ro.observe(host);

  // SPIN button (Pixi)
  const spinBtn = new Container();
  spinBtn.eventMode = 'static';
  spinBtn.cursor = 'pointer';
  const btnBg = new Graphics();
  btnBg.circle(0, 0, 36); btnBg.fill({ color: 0xffd166 });
  btnBg.circle(0, 0, 36); btnBg.stroke({ color: 0xfff4cc, width: 2 });
  spinBtn.addChild(btnBg);
  const btnGlyph = new Graphics();
  btnGlyph.moveTo(-10, -12).lineTo(14, 0).lineTo(-10, 12).closePath();
  btnGlyph.fill({ color: 0x1a0f2e });
  spinBtn.addChild(btnGlyph);
  app.stage.addChild(spinBtn);

  function positionButton(): void {
    spinBtn.x = app.screen.width / 2;
    spinBtn.y = app.screen.height - 48;
  }
  positionButton();
  if (fullScreen) window.addEventListener('resize', positionButton);
  const btnRo = !fullScreen && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(positionButton)
    : null;
  if (btnRo) btnRo.observe(host);

  const { winEl, multEl, statusEl } = opts.hud ?? {};

  let isSpinning = false;
  let unlocked = false;
  let multiplier = 1;
  let totalWin = 0;
  let disposed = false;

  function setStatus(text: string): void {
    if (statusEl) statusEl.textContent = text;
  }

  spinBtn.on('pointerdown', () => {
    if (!unlocked) {
      void audio().unlock().then(() => {
        startAmbient();
        setStatus('');
      });
      unlocked = true;
    }
    if (isSpinning) {
      try { reelSet.skip(); } catch { /* idle */ }
      return;
    }
    void handleSpin();
  });

  async function tickWin(target: number): Promise<void> {
    const counter = { v: totalWin };
    sfx('winCount', { volume: 0.6 });
    await new Promise<void>((resolve) => {
      gsap.to(counter, {
        v: target,
        duration: 0.5,
        ease: 'power2.out',
        onUpdate: () => {
          totalWin = counter.v;
          if (winEl) winEl.textContent = totalWin.toFixed(0);
        },
        onComplete: () => resolve(),
      });
    });
  }

  async function handleSpin(): Promise<void> {
    if (disposed) return;
    isSpinning = true;
    totalWin = 0;
    multiplier = 1;
    if (winEl) winEl.textContent = '0';
    if (multEl) multEl.textContent = '1';

    sfx('clickSpin');
    if (LEAD_IN_MS > 0) await wait(LEAD_IN_MS);

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    const grid = await mockServer.spin();
    reelSet.setResult(grid);
    await spinDone;
    if (disposed) return;

    let current = grid;
    while (!disposed) {
      const winners = detectWinners(current);
      if (winners.length === 0) break;

      sfx('winStart', { volume: 0.7 });
      await destroyWinners(reelSet, winners);
      await wait(PAUSE_AFTER_REMOVAL_MS);

      multiplier += 1;
      if (multEl) multEl.textContent = `${multiplier}`;
      if (multiplier === 2) sfx('multiActivate', { volume: 0.8 });

      const award = winners.length * 10 * multiplier;
      void tickWin(totalWin + award);

      const next = await mockServer.cascade(current, winners);
      reelSet.setDropOrder('all');
      await reelSet.refill({ winners, grid: next });
      current = next;
    }

    sfx('winEnd', { volume: 0.6 });
    isSpinning = false;
  }

  return (): void => {
    if (disposed) return;
    disposed = true;
    if (fullScreen) {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('resize', positionButton);
    }
    if (ro) ro.disconnect();
    if (btnRo) btnRo.disconnect();
    stopReelSpinLoop();
    app.ticker.remove(gsapDriver);
    app.destroy(true, { children: true });
  };
}
