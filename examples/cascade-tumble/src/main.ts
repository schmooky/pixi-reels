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

// Breathing room between "winners faded out" and "refill drop-in starts".
// Commercial tumble slots dial this between 150 ms (snappy) and 500 ms
// (dramatic). 300 ms is a comfortable default — long enough for the
// player to register that the wins are gone, short enough to keep
// cascade momentum.
const PAUSE_AFTER_REMOVAL_MS = 300;

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

// WIN DESTRUCTION is now a one-liner: `reelSet.destroySymbols(winners, { dim: 0.35 })`.
// The lib defers to each symbol's `playDestroy()` (sprite implode by default;
// Spine subclasses can route to a disintegration animation) and handles the
// zIndex bump + viewport dim for us.

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
      // Fall: bottom-row first within each reel (rowOrder default
      // 'bottomToTop'). Combined with the per-reel left-to-right stagger
      // from speed.spinDelay, this gives the canonical
      // "bottom-left falls first, top-right last" feel.
      fall:   { duration: 280, ease: 'sine.in', rowStagger: 50 },
      // Drop-in: top-down (rowOrder default 'topToBottom') with per-row
      // stagger. For cascade refills we'll override to simultaneous
      // via setDropOrder('all') below.
      dropIn: { duration: 480, ease: 'back.out(1.6)', rowStagger: 50, distance: 'perHole' },
    })
    .ticker(app.ticker)
    .build();
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ background: 0xffffff, resizeTo: window, antialias: true });
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
    onSpin: () => handleSpinPress(),
    onSpeedChange: (s) => reelSet.setSpeed(s),
    speeds: ['normal', 'turbo', 'superTurbo'],
  });

  let isSpinning = false;
  /**
   * AbortController for the current cascade chain. The button handler
   * aborts it when the player taps slam mid-round — `reelSet.skip()` is a
   * no-op between refills (engine idle), so the engine alone can't end
   * the chain. AbortController on runCascade ends it at the next await
   * boundary AND slams an in-flight refill. Reset per round.
   */
  let cascadeAbort: AbortController | null = null;

  function handleSpinPress(): void {
    if (isSpinning) {
      // Slam in-flight (if any) AND cancel the cascade chain so the round
      // exits even if the engine is currently between refills.
      try {
        if (reelSet.isSpinning) reelSet.skip();
      } catch { /* idle */ }
      cascadeAbort?.abort();
      return;
    }
    handleSpin().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('cascade-tumble: handleSpin failed', err);
      isSpinning = false;
      cascadeAbort = null;
      ui.setSpinning(false);
    });
  }

  // E2e probe — exposes user-code-level state Playwright can wait on.
  // Engine `isSpinning` oscillates per-refill in cascade mode, so we need
  // a stable "round in progress" flag to detect round completion.
  (globalThis as unknown as { __CASCADE_TUMBLE?: unknown }).__CASCADE_TUMBLE = {
    get busy(): boolean { return isSpinning; },
    get pendingSkip(): boolean { return !!cascadeAbort?.signal.aborted; },
  };

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
    isSpinning = true;
    ui.setSpinning(true);
    ui.showWin(0);
    multiplierEl.textContent = '';

    // ─── MOMENT A: fall on click, wait for server, drop in ───────
    // Initial drop reveals left-to-right (per-reel stagger) — pairs with
    // the in-reel row stagger (bottomToTop default) to give the canonical
    // "bottom-left first, top-right last" cascading reveal.
    cascadeAbort = new AbortController();

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();      // triggers cascade:fall on every reel
    const grid = await mockServer.spin();  // server can take any duration
    reelSet.setResult(grid);               // resolves wait → place → dropIn
    await spinDone;

    // ─── MOMENT B: cascade refill loop via reelSet.runCascade ────
    // The library owns the detect → destroy → pause → refill orchestration.
    // We supply: (1) win detection, (2) next-grid computation, (3) the
    // per-cascade multiplier + UI side effects. `cascade:complete` fires
    // at the end automatically; AbortController ends the round cleanly
    // when the player slams between refills (where reelSet.skip() is a no-op).
    //
    // Cascade refills: every reel drops simultaneously — the canonical
    // commercial pattern. ('ltr'/'rtl' on a refill reads as a fresh
    // reveal, which fights the player's expectation of a quick refill.)
    reelSet.setDropOrder('all');

    let totalWin = 0;
    const { chainLength } = await reelSet.runCascade({
      detectWinners: (g) => detectWinners(g),
      nextGrid: (prev, winners) => mockServer.cascade(prev, [...winners]),
      pauseAfterDestroyMs: PAUSE_AFTER_REMOVAL_MS,
      destroyOptions: { dim: 0.35 },
      signal: cascadeAbort.signal,
      onCascade: async ({ chain, winners }) => {
        totalWin += winners.length * 5 * chain;
        ui.showWin(totalWin);
        // Bump the multiplier as the symbols leave the frame. The player
        // reads the new value while staring at the holes.
        await tickMultiplier(chain + 1);
      },
    });

    if (chainLength === 0) multiplierEl.textContent = '';
    cascadeAbort = null;
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
