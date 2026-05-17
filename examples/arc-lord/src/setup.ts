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
    // Fake real-world server latency: 2-5 seconds. The UI shows a spinner
    // during this wait via the `serverWait` overlay below.
    await wait(2000 + Math.random() * 3000);
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

// Each entry is one row index per reel; the line wins if reel 0's symbol
// matches on 3+ consecutive reels along that pattern. 15 lines: 5 straights,
// 2 diagonals-then-flat, 4 zigzags, 4 V-shapes / shallow Vs.
const PAYLINES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4, 4],
  [0, 1, 2, 3, 4, 4],
  [4, 3, 2, 1, 0, 0],
  [0, 2, 0, 2, 0, 2],
  [4, 2, 4, 2, 4, 2],
  [1, 3, 1, 3, 1, 3],
  [3, 1, 3, 1, 3, 1],
  [1, 2, 3, 2, 1, 1],
  [3, 2, 1, 2, 3, 3],
  [0, 2, 4, 2, 0, 2],
  [4, 2, 0, 2, 4, 2],
];

interface WinReport {
  /** Cells to destroy (de-duped across all winning lines). */
  cells: Cell[];
  /** Sum of match lengths across winning lines — drives the award. */
  matchedCells: number;
  /** Count of paylines that hit. */
  lineHits: number;
}

function detectWinners(grid: string[][]): WinReport {
  const cells = new Map<number, Cell>();
  let matchedCells = 0;
  let lineHits = 0;
  for (const line of PAYLINES) {
    const head = grid[0][line[0]];
    if (head === '0') continue; // wild '0' acts as anchor — skip lines anchored on it for now
    let run = 1;
    for (let r = 1; r < REELS; r++) {
      if (grid[r][line[r]] === head) run++;
      else break;
    }
    if (run >= 3) {
      lineHits++;
      matchedCells += run;
      for (let r = 0; r < run; r++) {
        const row = line[r];
        const key = r * ROWS + row;
        if (!cells.has(key)) cells.set(key, { reel: r, row });
      }
    }
  }
  return { cells: [...cells.values()], matchedCells, lineHits };
}

async function destroyWinners(reelSet: ReelSet, winners: Cell[]): Promise<void> {
  if (winners.length === 0) return;
  reelSet.viewport.showDim(0.35);
  sfx('destroy', { volume: 0.9 });
  // Two-stage spine-driven win flow:
  //   1. Each winning cell plays its spine `win` track (celebration loop /
  //      one-shot — defined per skeleton). Player sees the reward beat.
  //   2. Each cell then plays its spine `out` (disintegration) track via
  //      `playDestroy()` — the library-side override on `SpineReelSymbol`
  //      routes `playDestroy()` to the spine `out` animation, falling back
  //      to the GSAP implode only if the skeleton lacks the track.
  await Promise.all(winners.map((w) => {
    const sym = reelSet.reels[w.reel].getSymbolAt(w.row);
    sym.view.zIndex = 1000;
    return sym.playWin();
  }));
  await Promise.all(winners.map((w, i) => {
    const sym = reelSet.reels[w.reel].getSymbolAt(w.row);
    return sym.playDestroy({
      direction: w.reel % 2 === 0 ? 1 : -1,
      delay: i * 0.015,
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
    background: 0xffffff,
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

  // Server-wait spinner — shown over the reels while mockServer.spin() resolves
  // (2-5 s of fake latency). Hidden whenever the engine is doing visible work.
  const serverWait = new Container();
  serverWait.visible = false;
  const spinnerRing = new Graphics();
  spinnerRing.arc(0, 0, 28, 0, Math.PI * 1.55);
  spinnerRing.stroke({ color: 0xffd166, width: 5, cap: 'round' });
  serverWait.addChild(spinnerRing);
  gsap.to(serverWait, { rotation: Math.PI * 2, duration: 0.9, ease: 'none', repeat: -1 });
  serverWait.x = totalW / 2;
  serverWait.y = totalH / 2;
  serverWait.zIndex = 2000;
  reelSet.sortableChildren = true;
  reelSet.addChild(serverWait);

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
  btnBg.circle(0, 0, 36); btnBg.stroke({ color: 0x1a0f2e, width: 2 });
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
  /**
   * Set when the player presses the spin button during the LEAD_IN_MS lead-in
   * or any other window where the engine isn't yet spinning. `handleSpin`
   * checks this right after `reelSet.spin()` and fires `requestSkip()` so the
   * player's tap-to-slam intent isn't silently dropped on the floor.
   */
  let pendingSkip = false;

  // E2e probe: exposes user-code-level state (which `__PIXI_REELS_DEBUG`
  // can't see) so Playwright can wait on "round fully complete" instead of
  // polling engine isSpinning, which oscillates between cascade refills.
  (globalThis as unknown as { __ARC_LORD?: unknown }).__ARC_LORD = {
    get busy(): boolean { return isSpinning; },
    get pendingSkip(): boolean { return pendingSkip; },
  };

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
      // Engine is mid-spin → slam now. Otherwise (lead-in, between-refill
      // pause, post-cascade settling) queue the skip so `handleSpin` can
      // fire it as soon as a spin/refill is actually in flight — the
      // alternative is silently dropping the tap and looking frozen.
      try {
        if (reelSet.isSpinning) reelSet.skip();
        else pendingSkip = true;
      } catch { /* idle */ }
      return;
    }
    // Reset isSpinning on any thrown error so a rapid double-tap that
    // races handleSpin into a bad state doesn't leave the button stuck
    // in "always-skip" mode (which looks like the game is frozen).
    pendingSkip = false;
    handleSpin().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('arc-lord: handleSpin failed', err);
      isSpinning = false;
      pendingSkip = false;
    });
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
    // Consume any skip-intent tapped during the lead-in: `requestSkip()`
    // queues until `setResult()` arrives, then slams.
    if (pendingSkip) {
      pendingSkip = false;
      reelSet.requestSkip();
    }
    serverWait.visible = true;
    let grid: string[][];
    try {
      grid = await mockServer.spin();
    } finally {
      serverWait.visible = false;
    }
    reelSet.setResult(grid);
    await spinDone;
    if (disposed) return;

    let current = grid;
    while (!disposed) {
      const report = detectWinners(current);
      if (report.cells.length === 0) break;

      sfx('winStart', { volume: 0.7 });
      await destroyWinners(reelSet, report.cells);
      await wait(PAUSE_AFTER_REMOVAL_MS);

      multiplier += 1;
      if (multEl) multEl.textContent = `${multiplier}`;
      if (multiplier === 2) sfx('multiActivate', { volume: 0.8 });

      // matchedCells counts each cell once per winning line — a single 5-of-a-kind
      // that hits 3 paylines pays 3× as much as one that only hits the straight.
      const award = report.matchedCells * 10 * multiplier;
      void tickWin(totalWin + award);

      const next = await mockServer.cascade(current, report.cells);
      reelSet.setDropOrder('all');
      const refillDone = reelSet.refill({ winners: report.cells, grid: next });
      // Tap during the between-refill pause? Fire skip now so the engine
      // auto-slams this refill as well — `skip()` is round-aware in cascade
      // mode, so once flagged the rest of the round fast-forwards.
      if (pendingSkip) {
        pendingSkip = false;
        try { reelSet.skip(); } catch { /* idle */ }
      }
      await refillDone;
      current = next;
    }
    pendingSkip = false;

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
