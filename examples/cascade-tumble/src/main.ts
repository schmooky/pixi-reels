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

// ─── LAYOUT ─────────────────────────────────────────────────
//
// 6 reels × 5 rows, sprite symbols. This is the canonical "Sweet Bonanza
// / Sugar Rush" cascade footprint — the one most production cascade slots
// ship with.

const REEL_COUNT = 6;
const VISIBLE_ROWS = 5;
const SYMBOL_SIZE = 95;
const SYMBOL_GAP = 5;

/**
 * Lead-in window between the SPIN click and the moment the engine actually
 * begins the fall-out animation. A short hold-back (~180 ms) makes the
 * click feel "received" — the button visibly transitions to STOP before
 * the symbols move. Without it the button-state flip and the fall start
 * land on the same frame and the player can't tell the click registered.
 */
const LEAD_IN_MS = 180;

/**
 * Breathing room between "winners faded out" and "refill drop-in starts".
 * Production tumble slots dial this between 150 ms (snappy) and 500 ms
 * (dramatic). 280 ms is the sweet spot — long enough for the player to
 * register that the wins are gone, short enough to keep cascade momentum.
 */
const PAUSE_AFTER_REMOVAL_MS = 280;

const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1',
  low2: 'round/round_2',
  low3: 'round/round_3',
  low4: 'round/round_4',
  med1: 'royal/royal_1',
  med2: 'royal/royal_2',
  high1: 'royal/royal_3',
  high2: 'royal/royal_4',
  wild:  'wild/wild_1',
};
const GAME_SYMBOLS = Object.keys(SYMBOL_MAP);

// ─── MOCK SERVER — DELIBERATELY SLOW INITIAL RESPONSE ───────
//
// The initial-spin latency is 1.5-4.5 s on purpose: this is what makes
// the "empty reels + spinner" window visible in the demo. Production
// servers vary wildly here (200 ms to multiple seconds for bonus
// rolls), and the engine's job is to stay visually coherent across the
// whole range. Cascade refills are 100-250 ms because most real backends
// precompute the cascade chain alongside the initial result.

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
    // 1.5-4.5 s — the long, visible "thinking" window.
    await wait(1500 + Math.random() * 3000);
    return randomGrid();
  },

  async cascade(prevGrid: string[][], winners: Cell[]): Promise<string[][]> {
    // 100-250 ms — refills are quick because the gravity sim is cheap.
    await wait(100 + Math.random() * 150);

    // Server-side gravity: survivors pack to the bottom, new symbols
    // fill the top. The library's algorithm expects this convention
    // (see the cascades guide).
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

// ─── WIN DETECTION ──────────────────────────────────────────
//
// Left-anchored runs of 3+ matching symbols on the same visible row.
// `wild` matches anything; a row starting on wild is skipped (it's not
// itself a trigger). This matches the classic Sweet Bonanza convention.

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

// ─── SPINNER OVERLAY ───────────────────────────────────────
//
// A simple rotating arc. Shown during the empty wait between
// `cascade:fall:end` (all reels finished falling) and `cascade:dropIn:start`
// (the first reel begins filling) — i.e. exactly the indeterminate
// server-roundtrip window.

function makeSpinner(): Container {
  const c = new Container();
  const ring = new Graphics();
  ring.arc(0, 0, 28, 0, Math.PI * 1.55);
  ring.stroke({ color: 0xc89c1f, width: 5, cap: 'round' });
  c.addChild(ring);
  c.visible = false;
  gsap.to(c, { rotation: Math.PI * 2, duration: 0.9, ease: 'none', repeat: -1 });
  return c;
}

// ─── BUILDER ────────────────────────────────────────────────

function buildReelSet(app: Application, textures: Record<string, Texture>): ReelSet {
  const symbolTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
  }
  return new ReelSetBuilder()
    .reels(REEL_COUNT)
    .visibleRows(VISIBLE_ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(SYMBOL_GAP, SYMBOL_GAP)
    .symbols((r) => {
      for (const id of GAME_SYMBOLS) {
        r.register(id, SpriteSymbol, { textures: symbolTextures });
      }
    })
    .weights({ low1: 18, low2: 18, low3: 18, low4: 18, med1: 12, med2: 12, high1: 6, high2: 6, wild: 3 })
    // Per-speed tumble overrides: faster speeds get progressively
    // shorter cascade timings on top of the base config below. Without
    // this, `setSpeed('turbo')` would only shrink the per-reel
    // `stopDelay` — the in-reel fall/drop tweens would still run at
    // the base 280 ms / 480 ms and the turbo button wouldn't feel any
    // different through the cascade. With it, turbo halves the durations
    // and superTurbo snaps everything in 60–80 ms.
    .speed('normal', {
      ...SpeedPresets.NORMAL,
      stopDelay: 150,
    })
    .speed('turbo', {
      ...SpeedPresets.TURBO,
      stopDelay: 80,
      tumble: {
        fall:   { duration: 140, rowStagger: 20 },
        dropIn: { duration: 220, rowStagger: 20 },
      },
    })
    .speed('superTurbo', {
      ...SpeedPresets.SUPER_TURBO,
      stopDelay: 0,
      tumble: {
        fall:   { duration: 60, rowStagger: 0 },
        dropIn: { duration: 80, rowStagger: 0 },
      },
    })
    .tumble({
      // Fall: per-reel left-to-right stagger from speed.spinDelay, plus
      // in-reel bottom-to-top from rowOrder default — gives the canonical
      // "bottom-left falls first, top-right last" cascading exit.
      fall:   { duration: 280, ease: 'sine.in', rowStagger: 50 },
      // Drop-in: 'perHole' gravity is the production default. Each
      // symbol falls exactly the distance its hole demands; survivors
      // that didn't move skip the tween entirely.
      dropIn: { duration: 480, ease: 'back.out(1.6)', rowStagger: 50, distance: 'perHole' },
    })
    .ticker(app.ticker)
    .build();
}

// ─── MAIN ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ background: 0xffffff, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  // GSAP MUST share Pixi's ticker so tweens run in hidden tabs / iframes.
  // Without this, cascades freeze when the user switches tabs.
  gsap.ticker.remove(gsap.updateRoot);
  app.ticker.add(() => gsap.updateRoot(app.ticker.lastTime / 1000));

  const { textures } = await loadPrototypeSymbols();
  const reelSet = buildReelSet(app, textures);
  enableDebug(reelSet);

  const totalWidth  = REEL_COUNT  * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const totalHeight = VISIBLE_ROWS * (SYMBOL_SIZE + SYMBOL_GAP) - SYMBOL_GAP;
  const wrapper = new Container();
  wrapper.addChild(reelSet);

  const spinner = makeSpinner();
  spinner.x = totalWidth  / 2;
  spinner.y = totalHeight / 2;
  wrapper.addChild(spinner);

  app.stage.addChild(wrapper);

  function reposition(): void {
    const pad = 16, uiH = 80;
    const s = Math.min(
      (app.screen.width  - pad * 2)        / totalWidth,
      (app.screen.height - pad * 2 - uiH)  / totalHeight,
      1,
    );
    wrapper.scale.set(s);
    wrapper.x = (app.screen.width  - totalWidth  * s) / 2;
    wrapper.y = (app.screen.height - totalHeight * s - uiH) / 2;
  }

  const frame = new Graphics();
  frame.roundRect(-10, -10, totalWidth + 20, totalHeight + 20, 8);
  frame.stroke({ color: 0xe74c3c, width: 3 });
  reelSet.addChildAt(frame, 0);

  const multiplierEl = document.getElementById('multiplier')!;
  const statusEl     = document.getElementById('status')!;

  // ─── SERVER-WAIT SPINNER WIRING ───────────────────────────
  //
  // Show the spinner from the moment ALL reels have finished falling out
  // until the FIRST reel begins its drop-in. That window is exactly the
  // indeterminate server wait — empty reels with a loading indicator.
  //
  // We track this with two events instead of polling, so the wait window
  // is precisely the engine's empty-reel beat (no off-by-one).

  let fallEnded = 0;
  reelSet.events.on('cascade:fall:end', () => {
    fallEnded += 1;
    if (fallEnded === REEL_COUNT) spinner.visible = true;
  });
  reelSet.events.on('cascade:dropIn:start', () => {
    spinner.visible = false;
    fallEnded = 0;
  });

  // ─── LANDING SQUISH (skip-safe via info.signal) ───────────
  //
  // Listener-side decoration: when each symbol's drop-in tween starts,
  // we run a parallel scale squish synced to the library's fall, then a
  // small bounce on landing. Both are scheduled off GSAP, independent
  // of the library's own timeline — so on a slam-stop the library snaps
  // the view to grid but our squish/bounce tweens would keep running
  // (the delayedCall fires `duration` ms later regardless), leaving the
  // symbol scaled or off-position.
  //
  // The `info.signal` AbortSignal fires when the phase is skipped. We
  // register a one-shot cleanup that kills our tweens and resets scale
  // — so slam-stop visually matches "snap to grid" instead of "snap to
  // grid then bounce again."
  reelSet.events.on('cascade:dropIn:symbol', (info) => {
    const { view, duration, signal } = info;
    const fallSec   = duration / 1000;
    const bounceSec = 0.1;

    const squish = gsap.to(view.scale, {
      x: 1.15,
      y: 0.78,
      duration: fallSec,
      ease: 'sine.in',
    });

    const landed = gsap.delayedCall(fallSec, () => {
      const gridY = view.y;
      gsap.timeline()
        .to(view,       { y: gridY - 12, duration: bounceSec, ease: 'sine.out' })
        .to(view.scale, { x: 1, y: 1,    duration: bounceSec, ease: 'sine.out' }, '<')
        .to(view,       { y: gridY,      duration: bounceSec, ease: 'sine.in'  });
    });

    signal.addEventListener('abort', () => {
      squish.kill();
      landed.kill();
      view.scale.set(1, 1);
    }, { once: true });
  });

  // ─── UI STATE ─────────────────────────────────────────────
  //
  // The button is a single SPIN/STOP toggle from `createUI`. Three
  // possible "round in flight" states matter for rapid clicks:
  //
  //   1. Engine spinning (`reelSet.isSpinning === true`) — `skip()`
  //      slams immediately. The library's round-aware skip handles
  //      the cascade case (`_autoSlamRefills` flag).
  //   2. User-code mid-round but engine idle (e.g. inside the
  //      `LEAD_IN_MS` wait, between `setResult` and the first refill
  //      tween, in `pauseAfterDestroyMs`). `skip()` is a no-op here
  //      because the engine isn't running any phase. We queue the
  //      intent so the next time control passes through user-code
  //      (e.g. the next chain iteration), we fire `skip()`.
  //   3. Engine pre-`setResult` (during the server wait) — the
  //      library's `requestSkip()` handles this case: it queues the
  //      slam and fires it the moment `setResult` arrives, so the
  //      reels land on the intended grid instead of a random buffer.
  //
  // The AbortController gives us a fourth lever: it ends the cascade
  // chain at the next await boundary AND slams an in-flight refill.
  // Together they cover every rapid-click window the user can hit.

  const ui = createUI({
    onSpin: () => handleSpinPress(),
    onSpeedChange: (s) => reelSet.setSpeed(s),
    speeds: ['normal', 'turbo', 'superTurbo'],
  });

  let isSpinning = false;
  let pendingSkip = false;
  let cascadeAbort: AbortController | null = null;

  function handleSpinPress(): void {
    if (!isSpinning) {
      pendingSkip = false;
      handleSpin().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('cascade-tumble: handleSpin failed', err);
        isSpinning = false;
        cascadeAbort = null;
        pendingSkip = false;
        ui.setSpinning(false);
      });
      return;
    }
    // Engine in flight → use the right slam tool for the current
    // window. `requestSkip()` is queue-safe pre-setResult; `skip()`
    // slams in-flight phases; the AbortController ends the chain
    // at the next await boundary (covers the idle-between-refills
    // window where neither skip() nor requestSkip() can act).
    if (reelSet.isSpinning) {
      try { reelSet.requestSkip(); } catch { /* idle */ }
    } else {
      pendingSkip = true;
    }
    cascadeAbort?.abort();
  }

  // E2e probe — exposes user-code-level state Playwright can wait on.
  // Engine `isSpinning` oscillates per-refill in cascade mode, so we need
  // a stable "round in progress" flag to detect round completion.
  (globalThis as unknown as { __CASCADE_TUMBLE?: unknown }).__CASCADE_TUMBLE = {
    get busy(): boolean { return isSpinning; },
    get pendingSkip(): boolean { return pendingSkip || !!cascadeAbort?.signal.aborted; },
  };

  async function tickMultiplier(target: number): Promise<void> {
    const counter = { v: Math.max(0, target - 1) };
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
    statusEl.textContent = '';

    // Fresh AbortController per round — abort() flips the flag inside
    // `runCascade` so the chain ends at the next await boundary even
    // when the engine itself is idle (between refills).
    cascadeAbort = new AbortController();

    // Lead-in: the button visibly transitions to STOP before the symbols
    // move. A tap during this window queues `pendingSkip` and is consumed
    // by `requestSkip()` once the engine spin actually starts. We do NOT
    // bail on `cascadeAbort.signal.aborted` here — a rapid double-click
    // means "spin then slam," not "cancel before starting." The abort
    // flag flows into runCascade, which will short-circuit the cascade
    // chain at the next await boundary.
    if (LEAD_IN_MS > 0) await wait(LEAD_IN_MS);

    // ─── MOMENT A: fall, wait, drop in ─────────────────────
    //
    // Initial drop reveals left-to-right (per-reel stagger). Combined
    // with the per-reel bottom-to-top from rowOrder default, this
    // gives the canonical "bottom-left first, top-right last" reveal.
    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();

    // Consume any skip-intent tapped during the lead-in. `requestSkip()`
    // queues until `setResult()` arrives, then slams — so even taps
    // inside the long server wait route through to a clean slam on the
    // intended result grid.
    if (pendingSkip) {
      pendingSkip = false;
      reelSet.requestSkip();
    }

    const grid = await mockServer.spin();
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await spinDone;

    // ─── MOMENT B: cascade refill loop via reelSet.runCascade ────
    //
    // The library owns the detect → destroy → pause → refill orchestration.
    // We supply: (1) win detection, (2) next-grid computation, (3) the
    // per-cascade multiplier + UI side effects. The awaited summary
    // (`RunCascadeResult`) tells us how the chain ended. AbortController
    // ends the round cleanly when the player slams between refills
    // (where `reelSet.skipSpin()` is a no-op because no phase is active).
    //
    // Cascade refills: every reel drops simultaneously — the canonical
    // commercial pattern. ('ltr' / 'rtl' on a refill reads as a fresh
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
        // Honor a queued slam tap that landed while user-code was
        // mid-await: ask the engine to slam every remaining refill.
        if (pendingSkip) {
          pendingSkip = false;
          try { reelSet.skipSpin(); } catch { /* idle */ }
        }
      },
    });

    if (chainLength === 0) {
      multiplierEl.textContent = '';
      statusEl.textContent = 'No wins — try again.';
    } else {
      statusEl.textContent = `${chainLength} cascade${chainLength === 1 ? '' : 's'} · WIN ${totalWin}`;
    }

    cascadeAbort = null;
    isSpinning = false;
    pendingSkip = false;
    ui.setSpinning(false);
  }

  // ─── LIFECYCLE-EVENT HOOKS (showcased for DX) ─────────────
  //
  // `cascade:chain:start` / `cascade:chain:end` fire per refill stage,
  // letting sibling modules (audio bus, HUD, analytics) react without
  // polling `isSpinning` (which oscillates per-refill in cascade mode).
  // Wired here as demo log lines.
  reelSet.events.on('cascade:chain:start', ({ chain, winners }) => {
    // eslint-disable-next-line no-console
    console.log(`[cascade] chain ${chain} — ${winners.length} winner(s)`);
  });
  reelSet.events.on('cascade:chain:end', ({ chain, nextGrid }) => {
    // eslint-disable-next-line no-console
    console.log(`[cascade] chain ${chain} done — next grid:`,
      nextGrid.map((c) => c.join(',')).join(' | '));
  });

  reposition();
  window.addEventListener('resize', reposition);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
