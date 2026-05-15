import { Application, Container, Graphics, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
  SpriteSymbol,
  type Cell,
  type ReelSet,
} from 'pixi-reels';
import { loadPrototypeSymbols } from '../../shared/prototypeSpriteLoader.js';
import { createUI } from '../../shared/ui.js';

// ------------------------------------------------------------
// LAYOUT
// ------------------------------------------------------------

const REEL_COUNT = 6;
const VISIBLE_ROWS = 5;
const SYMBOL_SIZE = 95;
const SYMBOL_GAP = 5;

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

// ------------------------------------------------------------
// MOCK SERVER — variable-latency tumble simulator
//
// First-response latency is intentionally large (400–900 ms) so the empty
// wait between fall-out and drop-in is clearly visible. Cascade refills are
// snappier (100–250 ms) since production servers often have these
// precomputed alongside the initial result.
// ------------------------------------------------------------

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickWeighted(): string {
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

function randomGrid(): string[][] {
  return Array.from({ length: REEL_COUNT }, () =>
    Array.from({ length: VISIBLE_ROWS }, pickWeighted),
  );
}

const mockServer = {
  async spin(): Promise<string[][]> {
    await wait(400 + Math.random() * 500);
    return randomGrid();
  },

  async cascade(prevGrid: string[][], winners: Cell[]): Promise<string[][]> {
    await wait(100 + Math.random() * 150);

    // Server-side gravity: survivors pack to the bottom, new symbols fill
    // the top. The library's algorithm expects this convention.
    const next: string[][] = prevGrid.map((col) => [...col]);
    const winnersByReel = new Map<number, Set<number>>();
    for (const w of winners) {
      const set = winnersByReel.get(w.reel) ?? new Set<number>();
      set.add(w.row);
      winnersByReel.set(w.reel, set);
    }
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      const losers = winnersByReel.get(reel);
      if (!losers || losers.size === 0) continue;
      const survivors: string[] = [];
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        if (!losers.has(row)) survivors.push(next[reel][row]);
      }
      const fillers = Array.from({ length: losers.size }, pickWeighted);
      next[reel] = [...fillers, ...survivors];
    }
    return next;
  },
};

// ------------------------------------------------------------
// WIN DETECTION (left-to-right runs from reel 0; classic ways pay)
// ------------------------------------------------------------

function detectWinners(grid: string[][]): Cell[] {
  const winners: Cell[] = [];
  for (let row = 0; row < VISIBLE_ROWS; row++) {
    const head = grid[0][row];
    if (head === 'wild') continue;
    let run = 1;
    for (let reel = 1; reel < REEL_COUNT; reel++) {
      if (grid[reel][row] === head || grid[reel][row] === 'wild') run++;
      else break;
    }
    if (run >= 3) {
      for (let reel = 0; reel < run; reel++) winners.push({ reel, row });
    }
  }
  return winners;
}

// ------------------------------------------------------------
// SPINNER OVERLAY — visible during the empty wait between fall and drop-in
// ------------------------------------------------------------

function makeSpinner(): Container {
  const c = new Container();
  const ring = new Graphics();
  ring.arc(0, 0, 22, 0, Math.PI * 1.5);
  ring.stroke({ color: 0xf1c40f, width: 4 });
  c.addChild(ring);
  c.visible = false;
  gsap.to(c, { rotation: Math.PI * 2, duration: 1, ease: 'none', repeat: -1 });
  return c;
}

// ------------------------------------------------------------
// WIN FADE-OUT — caller-owned. The library does NOT animate this step.
// ------------------------------------------------------------

async function fadeOutWinners(reelSet: ReelSet, winners: Cell[]): Promise<void> {
  reelSet.viewport.showDim(0.35);
  const tweens: Promise<void>[] = [];
  for (const w of winners) {
    const view = reelSet.reels[w.reel].getSymbolAt(w.row).view;
    view.zIndex = 1000;
    tweens.push(
      new Promise<void>((resolve) => {
        gsap.to(view, {
          alpha: 0,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: () => resolve(),
        });
      }),
    );
  }
  await Promise.all(tweens);
  reelSet.viewport.hideDim();
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

function buildReelSet(app: Application, textures: Record<string, Texture>): ReelSet {
  const symbolTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
  }
  return new ReelSetBuilder()
    .reels(REEL_COUNT)
    .visibleSymbols(VISIBLE_ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      for (const id of GAME_SYMBOLS) {
        r.register(id, SpriteSymbol, { textures: symbolTextures });
      }
    })
    .weights({ low1: 18, low2: 18, low3: 18, low4: 18, med1: 12, med2: 12, high1: 6, high2: 6, wild: 3 })
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
    .speed('turbo', { ...SpeedPresets.TURBO, stopDelay: 80 })
    .speed('superTurbo', { ...SpeedPresets.SUPER_TURBO, stopDelay: 0 })
    .tumble({
      fall:   { duration: 280, ease: 'sine.in',       rowStagger: 40 },
      dropIn: { duration: 480, ease: 'back.out(1.6)', rowStagger: 50, distance: 'perHole' },
    })
    .ticker(app.ticker)
    .build();
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ background: 0x0f3460, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  gsap.ticker.remove(gsap.updateRoot);
  app.ticker.add(() => gsap.updateRoot(app.ticker.lastTime / 1000));

  const { textures } = await loadPrototypeSymbols();
  const reelSet = buildReelSet(app, textures);
  enableDebug(reelSet);

  const totalWidth = REEL_COUNT * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const totalHeight = VISIBLE_ROWS * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const wrapper = new Container();
  wrapper.addChild(reelSet);

  const spinner = makeSpinner();
  spinner.x = totalWidth / 2;
  spinner.y = totalHeight / 2;
  wrapper.addChild(spinner);

  app.stage.addChild(wrapper);

  function reposition(): void {
    const pad = 16, uiH = 80;
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
  frame.roundRect(-10, -10, totalWidth + 20, totalHeight + 20, 8);
  frame.stroke({ color: 0xe74c3c, width: 3 });
  reelSet.addChildAt(frame, 0);

  const multiplierEl = document.getElementById('multiplier')!;

  // --- TUMBLE EVENT WIRING -------------------------------------
  //
  // Show the spinner from the moment ALL reels have finished falling out
  // until the FIRST reel begins its drop-in. That window is exactly the
  // indeterminate server wait — empty reels with a loading indicator.

  let fallEnded = 0;
  reelSet.events.on('cascade:fall:end', () => {
    fallEnded += 1;
    if (fallEnded === REEL_COUNT) spinner.visible = true;
  });
  reelSet.events.on('cascade:dropIn:start', () => {
    spinner.visible = false;
    fallEnded = 0;
  });

  const ui = createUI({
    onSpin: () => void handleSpin(),
    onSpeedChange: (s) => reelSet.setSpeed(s),
    speeds: ['normal', 'turbo', 'superTurbo'],
  });

  let isSpinning = false;

  // Quick number-roll. Runs in the gap between win-fade and refill drop-in,
  // where the player's attention is free.
  async function tickMultiplier(target: number): Promise<void> {
    const counter = { v: target - 1 };
    await new Promise<void>((resolve) => {
      gsap.to(counter, {
        v: target,
        duration: 0.4,
        ease: 'power2.out',
        onUpdate: () => {
          multiplierEl.textContent = `MULTIPLIER ×${Math.round(counter.v)}`;
        },
        onComplete: () => resolve(),
      });
    });
  }

  async function handleSpin(): Promise<void> {
    if (isSpinning) {
      try { reelSet.skip(); } catch { /* guarded internally */ }
      return;
    }

    isSpinning = true;
    ui.setSpinning(true);
    ui.showWin(0);
    multiplierEl.textContent = '';

    // ─── MOMENT A: fall on click, wait for server, drop in ───────
    const spinDone = reelSet.spin();      // triggers cascade:fall on every reel
    const grid = await mockServer.spin();  // server can take any duration
    reelSet.setResult(grid);               // resolves wait → place → dropIn
    await spinDone;

    // ─── MOMENT B: cascade refill loop ───────────────────────────
    let current = grid;
    let multiplier = 1;
    let cascadeLevel = 0;
    let totalWin = 0;

    while (true) {
      const winners = detectWinners(current);
      if (winners.length === 0) break;

      cascadeLevel += 1;
      totalWin += winners.length * 5 * cascadeLevel;
      ui.showWin(totalWin);

      await fadeOutWinners(reelSet, winners);

      // Bump the multiplier as the symbols leave the frame. The player
      // reads the new value while staring at the holes.
      multiplier += 1;
      await tickMultiplier(multiplier);

      const next = await mockServer.cascade(current, winners);
      await reelSet.refill({ winners, grid: next });
      current = next;
    }

    if (cascadeLevel === 0) multiplierEl.textContent = '';
    isSpinning = false;
    ui.setSpinning(false);
  }

  reposition();
  window.addEventListener('resize', reposition);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
