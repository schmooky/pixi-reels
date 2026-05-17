import { Application, Graphics } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, enableDebug } from 'pixi-reels';
import type { ReelSet } from 'pixi-reels';
import type { TumbleConfig } from 'pixi-reels';
import type { Cell } from 'pixi-reels';
import { gsap } from 'gsap';
import { BlockSymbol } from './BlockSymbol.ts';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { CardSymbol, CARD_DECK } from '../../../../examples/shared/CardSymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';
import {
  CheatEngine,
  type CheatDefinition,
} from '../../../../examples/shared/cheats.ts';
import type { DemoApi } from './DemoSandbox.tsx';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Width reserved on the right side of the canvas for the tall vertical
 * spin button. The reel area gets the remaining horizontal space.
 */
const BUTTON_COL_WIDTH = 96;

/**
 * Block-symbol entry (colored rounded rect with a glyph). Good for abstract
 * mechanic teaching; used when art isn't the point.
 */
export interface BlockSymbolDef {
  id: string;
  color: number;
  glyph?: string;
}

// Sync GSAP with Pixi's ticker so it works in hidden tabs too.
let gsapSynced = false;
function syncGsap(app: Application): void {
  if (gsapSynced) return;
  gsapSynced = true;
  try {
    gsap.ticker.remove(gsap.updateRoot);
  } catch { /* ignore */ }
  app.ticker.add((ticker) => {
    gsap.updateRoot(ticker.lastTime / 1000);
  });
}

export interface MechanicConfig {
  reelCount: number;
  visibleRows: number;
  symbolSize: { width: number; height: number };
  /**
   * Symbol set. Two shapes:
   *   - `kind: 'block'` (default) — colored rounded rects with a glyph.
   *   - `kind: 'sprite'` — ids must be frame names from the prototype atlas
   *     (`royal/royal_1`, `wild/wild_1`, …). Uses `BlurSpriteSymbol` with
   *     blur-on-spin.
   */
  symbols:
    | BlockSymbolDef[]
    | { kind: 'block'; defs: BlockSymbolDef[] }
    | { kind: 'sprite'; ids: string[]; blurOnSpin?: boolean }
    | { kind: 'card' };
  weights?: Record<string, number>;
  cheats: CheatDefinition[];
  /**
   * Enable tumble/cascade flow. When set, the builder is configured via
   * `.tumble(config)` and the mechanic's `runSpin` runs an auto-cascade
   * loop (3-in-a-row left-anchored detection per row, gravity-correct
   * refill via the new `reelSet.refill()` API) after every initial spin.
   * Pass `true` for default tumble feel, or a config to customize.
   */
  tumble?: true | TumbleConfig;
  /**
   * Optional fake-server delay (ms) inserted on the initial spin between
   * `reelSet.spin()` and `reelSet.setResult()` — the moment AFTER the
   * symbols fall out and BEFORE the new ones can be filled in. Returns
   * the wait per spin; pass `() => 1000 + Math.random() * 4000` to
   * simulate a real 1-5 s server response.
   *
   * A canvas spinner overlays the empty reels after a 200 ms debounce,
   * so short waits don't flicker. A slam-stop pressed DURING this wait
   * is deferred via `requestSkip()` — the engine queues the slam and
   * fires it the moment `setResult()` arrives, so the reels land on the
   * intended result instead of snapping to a random buffer.
   */
  fakeServerDelay?: () => number;
  /** Runs after every completed spin. Return a promise for win animations. */
  onLanded?: (ctx: LandedCtx) => Promise<void> | void;
  /** Custom spin button label. */
  spinLabel?: string;
  /** Called before each spin to allow per-spin setup (e.g., setHeld). */
  beforeSpin?: (engine: CheatEngine) => void;
  /** Title rendered in the cheat panel. */
  cheatTitle?: string;
}

type NormalizedSymbols =
  | { kind: 'block'; defs: BlockSymbolDef[] }
  | { kind: 'sprite'; ids: string[]; blurOnSpin: boolean }
  | { kind: 'card'; ids: string[] };

function normalizeSymbolConfig(symbols: MechanicConfig['symbols']): NormalizedSymbols {
  if (Array.isArray(symbols)) return { kind: 'block', defs: symbols };
  if (symbols.kind === 'sprite') return { kind: 'sprite', ids: symbols.ids, blurOnSpin: symbols.blurOnSpin ?? true };
  if (symbols.kind === 'card') return { kind: 'card', ids: CARD_DECK.map((c) => c.id) };
  return { kind: 'block', defs: symbols.defs };
}

/**
 * 3-in-a-row left-anchored win detection. Walks each visible row; if the
 * first 3+ reels share an id, that horizontal run wins. De-dupes across
 * rows so the same cell isn't destroyed twice.
 */
function detectWinners(grid: string[][], reelCount: number, visibleRows: number): Cell[] {
  const seen = new Set<number>();
  const out: Cell[] = [];
  for (let row = 0; row < visibleRows; row++) {
    const head = grid[0][row];
    let run = 1;
    for (let r = 1; r < reelCount; r++) {
      if (grid[r][row] === head) run++;
      else break;
    }
    if (run >= 3) {
      for (let r = 0; r < run; r++) {
        const key = r * visibleRows + row;
        if (!seen.has(key)) { seen.add(key); out.push({ reel: r, row }); }
      }
    }
  }
  return out;
}

/**
 * Gravity-correct next grid for a cascade refill. Drops survivors, fills
 * holes at the top with random new symbols.
 */
function cascadeNextGrid(
  prev: string[][],
  winners: Cell[],
  symbolIds: string[],
  weights: Record<string, number>,
): string[][] {
  const byReel = new Map<number, Set<number>>();
  for (const w of winners) {
    let s = byReel.get(w.reel);
    if (!s) { s = new Set(); byReel.set(w.reel, s); }
    s.add(w.row);
  }
  const next: string[][] = prev.map((c) => [...c]);
  for (let r = 0; r < next.length; r++) {
    const losers = byReel.get(r);
    if (!losers || losers.size === 0) continue;
    const survivors = next[r].filter((_, row) => !losers.has(row));
    const fillers = Array.from({ length: losers.size }, () => pickWeightedId(symbolIds, weights));
    next[r] = [...fillers, ...survivors];
  }
  return next;
}

function pickWeightedId(ids: string[], weights: Record<string, number>): string {
  const total = ids.reduce((acc, id) => acc + (weights[id] ?? 1), 0);
  let n = Math.random() * total;
  for (const id of ids) {
    n -= weights[id] ?? 1;
    if (n <= 0) return id;
  }
  return ids[ids.length - 1];
}

export interface LandedCtx {
  reelSet: ReelSet;
  engine: CheatEngine;
  grid: string[][];
  meta: Record<string, unknown>;
  api: DemoApi;
  toast: DemoApi['toast'];
  /**
   * Trigger another spin programmatically (e.g. a free-spins autoplay loop).
   * Resolves after the spin has completed and `onLanded` finished. Safe to
   * call from inside `onLanded` — it schedules on the next tick so the
   * current handler can unwind first.
   */
  requestSpin: () => Promise<void>;
}

export async function mountMechanic(
  host: HTMLDivElement,
  api: DemoApi,
  cfg: MechanicConfig,
): Promise<() => void> {
  // Size the PIXI canvas to the container. The right side reserves a
  // BUTTON_COL_WIDTH-wide column for the tall vertical spin button. Width
  // adapts to `host.clientWidth` so the demo fits any viewport (mobile
  // portrait, tablet, rotate) — see the ResizeObserver wired up after the
  // layout block.
  const computeWidth = (): number => Math.min(
    host.clientWidth || 800,
    cfg.reelCount * (cfg.symbolSize.width + 6) + 80 + BUTTON_COL_WIDTH,
  );
  let width = computeWidth();
  const height = cfg.visibleRows * (cfg.symbolSize.height + 6) + 80;

  const app = new Application();
  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  syncGsap(app);

  host.innerHTML = '';
  host.style.position = 'relative';
  host.appendChild(app.canvas);

  const symbolCfg = normalizeSymbolConfig(cfg.symbols);
  const allSymbolIds: string[] =
    symbolCfg.kind === 'block' ? symbolCfg.defs.map((s) => s.id) : symbolCfg.ids;

  // Sprite mode: resolve atlas textures once per module load.
  let spriteTextures: { base: Record<string, import('pixi.js').Texture>; blur: Record<string, import('pixi.js').Texture> } | null = null;
  if (symbolCfg.kind === 'sprite') {
    const atlas = await loadPrototypeSymbols();
    const base: Record<string, import('pixi.js').Texture> = {};
    const blur: Record<string, import('pixi.js').Texture> = {};
    for (const id of symbolCfg.ids) {
      const t = atlas.textures[id];
      if (!t) throw new Error(`prototype atlas missing frame "${id}"`);
      base[id] = t;
      if (atlas.blurTextures[id]) blur[id] = atlas.blurTextures[id];
    }
    spriteTextures = { base, blur };
  }

  const colors: Record<string, number> = {};
  const glyphs: Record<string, string> = {};
  if (symbolCfg.kind === 'block') {
    for (const s of symbolCfg.defs) {
      colors[s.id] = s.color;
      if (s.glyph) glyphs[s.id] = s.glyph;
    }
  }

  const builder = new ReelSetBuilder()
    .reels(cfg.reelCount)
    .visibleSymbols(cfg.visibleRows)
    .symbolSize(cfg.symbolSize.width, cfg.symbolSize.height)
    .symbolGap(6, 6)
    .symbols((r) => {
      // Split the kind check first so TS narrows the union cleanly into the
      // final `else` (the spriteTextures guard isn't enough to discriminate).
      if (symbolCfg.kind === 'sprite') {
        if (!spriteTextures) return;
        for (const id of symbolCfg.ids) {
          r.register(id, BlurSpriteSymbol, {
            textures: spriteTextures.base,
            blurTextures: spriteTextures.blur,
            anchor: { x: 0.5, y: 0.5 },
            fit: true,
          });
        }
      } else if (symbolCfg.kind === 'card') {
        for (const c of CARD_DECK) {
          r.register(c.id, CardSymbol, { color: c.color, label: c.label });
        }
      } else {
        for (const s of symbolCfg.defs) {
          r.register(s.id, BlockSymbol, { colors, glyphs, radius: 14 });
        }
      }
    })
    .weights(cfg.weights ?? {})
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker);

  if (cfg.tumble) {
    // `.tumble(true)` → defaults (no-overshoot drop-in via TumbleConfig).
    // `.tumble(config)` → caller-customized fall + dropIn timings.
    builder.tumble(cfg.tumble === true ? undefined : cfg.tumble);
  }

  const reelSet = builder.build();

  // Sprite mode: wire blur-on-spin. Also re-blur newly wrapped-in symbols
  // during SPIN so fresh pooled cells inherit the reel's current blur state.
  if (symbolCfg.kind === 'sprite' && symbolCfg.blurOnSpin) {
    const blurring = new Array<boolean>(cfg.reelCount).fill(false);
    const setReelBlur = (reelIdx: number, on: boolean) => {
      const reel = reelSet.getReel(reelIdx);
      for (let row = 0; row < cfg.visibleRows; row++) {
        const sym = reel.getSymbolAt(row);
        if (sym instanceof BlurSpriteSymbol) sym.setBlurred(on);
      }
    };
    for (let r = 0; r < cfg.reelCount; r++) {
      const reel = reelSet.getReel(r);
      reel.events.on('phase:enter', (phaseName) => {
        if (phaseName === 'spin') { blurring[r] = true; setReelBlur(r, true); }
        else if (phaseName === 'stop') { blurring[r] = false; setReelBlur(r, false); }
      });
      reel.events.on('symbol:created', () => {
        if (blurring[r]) setReelBlur(r, true);
      });
    }
    // Slam-stop: skip() can short-circuit STOP's onEnter path in-flight, so the
    // per-reel `phase:enter 'stop'` never fires. Clear blur on every reel the
    // moment skip is requested so the final landing is always crisp.
    reelSet.events.on('skip:requested', () => {
      for (let r = 0; r < cfg.reelCount; r++) {
        blurring[r] = false;
        setReelBlur(r, false);
      }
    });
  }

  // Frame behind the reels — centered in the LEFT region of the canvas,
  // leaving BUTTON_COL_WIDTH on the right for the tall vertical spin button.
  const frame = new Graphics();
  const padX = 10;
  const padY = 10;
  const totalW = cfg.reelCount * (cfg.symbolSize.width + 6) - 6 + padX * 2;
  const totalH = cfg.visibleRows * (cfg.symbolSize.height + 6) - 6 + padY * 2;
  // Neutral white well with a subtle warm border — matches the site's light palette.
  frame.roundRect(0, 0, totalW, totalH, 18)
    .fill({ color: 0xffffff, alpha: 1 })
    .roundRect(0, 0, totalW, totalH, 18)
    .stroke({ color: 0xe5dccf, width: 1, alpha: 0.9 });
  app.stage.addChild(frame);
  app.stage.addChild(reelSet);

  // Fake-server-wait spinner — centered on the reel frame. Shown only
  // when `cfg.fakeServerDelay` is set AND the wait exceeds the 200 ms
  // debounce threshold. Sits in the gap between fall (symbols gone) and
  // fill (new symbols arrive) on the initial spin. Drawn outside the
  // reelSet so it isn't masked.
  const cascadeSpinner = new Graphics();
  cascadeSpinner.arc(0, 0, 28, 0, Math.PI * 1.55);
  cascadeSpinner.stroke({ color: 0xffd166, width: 5, cap: 'round' });
  cascadeSpinner.visible = false;
  gsap.to(cascadeSpinner, { rotation: Math.PI * 2, duration: 0.9, ease: 'none', repeat: -1 });
  app.stage.addChild(cascadeSpinner);

  // Recompute width-dependent positions AND scale the reels to fit. Called
  // once at boot and on every host resize so the canvas stays fit on mobile
  // rotation / responsive breakpoints. Height is reel-geometry-bound; if the
  // host can't fit the intrinsic reel width, we scale everything (frame +
  // reelSet + spinner) down uniformly so all five columns stay visible
  // beside the spin button — mirroring RecipeRunner's `fit()` pattern.
  const relayout = (): void => {
    width = computeWidth();
    app.renderer.resize(width, height);
    const reelArea = width - BUTTON_COL_WIDTH;
    const scale = Math.min(1, reelArea / totalW, height / totalH);
    const scaledW = totalW * scale;
    const scaledH = totalH * scale;
    frame.scale.set(scale);
    frame.x = (reelArea - scaledW) / 2;
    frame.y = (height - scaledH) / 2;
    reelSet.scale.set(scale);
    reelSet.x = frame.x + padX * scale;
    reelSet.y = frame.y + padY * scale;
    cascadeSpinner.scale.set(scale);
    cascadeSpinner.x = frame.x + scaledW / 2;
    cascadeSpinner.y = frame.y + scaledH / 2;
  };
  relayout();
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => relayout())
    : null;
  resizeObserver?.observe(host);

  // Attach debug to window — matches what every guide/demo advertises.
  enableDebug(reelSet);

  // Engine
  const engine = new CheatEngine({
    reelCount: cfg.reelCount,
    visibleRows: cfg.visibleRows,
    symbolIds: allSymbolIds,
    seed: 12345,
  });
  for (const c of cfg.cheats) engine.register({ ...c });

  // Spin button icons.
  //   - ICON_SPIN (idle): refresh arrows — "start a new spin"
  //   - ICON_SKIP (mid-spin): lucide skip-forward — triangle + bar, the
  //     canonical "jump to end" glyph. Conveys "land the reels now"
  //     better than a stop-square would.
  const ICON_SPIN = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
  const ICON_SKIP = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`;

  const spinBtn = document.createElement('button');
  spinBtn.innerHTML = ICON_SPIN;
  spinBtn.title = 'Spin';
  spinBtn.setAttribute('aria-label', 'Spin');
  // Circular button on the right edge, vertically centered. Sized to fit
  // inside the reserved BUTTON_COL_WIDTH column to the right of the reels.
  // Sizing + classes mirror RecipeRunner.tsx so demos and recipes share
  // one button look (56×56, right-edge centered, shadow-md). The
  // BUTTON_COL_WIDTH column stays wide enough for generous right-margin.
  spinBtn.className = [
    'absolute right-3 top-1/2 -translate-y-1/2',
    'inline-flex h-14 w-14 items-center justify-center rounded-full',
    'border border-border/70 bg-background/80 text-foreground shadow-md backdrop-blur',
    'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' ');
  spinBtn.style.zIndex = '5';
  host.appendChild(spinBtn);

  let spinning = false;
  const setSpinState = (on: boolean): void => {
    spinning = on;
    spinBtn.innerHTML = on ? ICON_SKIP : ICON_SPIN;
    spinBtn.title = on ? 'Skip' : 'Spin';
    spinBtn.setAttribute('aria-label', on ? 'Skip' : 'Spin');
    if (on) {
      spinBtn.classList.add('bg-primary', 'text-primary-foreground', 'border-primary');
    } else {
      spinBtn.classList.remove('bg-primary', 'text-primary-foreground', 'border-primary');
    }
  };

  const runSpin = async (): Promise<void> => {
    if (spinning) {
      // Engine spinning → `requestSkip()` auto-routes: if `setResult()`
      // hasn't fired yet (we're in the fall + server-wait window), the
      // library queues the slam and fires it the moment the result
      // arrives — so the reels land on the intended grid instead of
      // snapping to a random buffer. Once `setResult()` is in, the same
      // call slams immediately.
      //
      // Mid-cascade taps when the engine is idle BETWEEN refills are
      // ignored here by design: `requestSkip()` is a no-op when the
      // engine isn't spinning, and there's no engine-level "fast-forward
      // remaining cascades" surface. Recipes that need that behaviour
      // wire `runCascade({ signal })` to an `AbortController` — see the
      // `examples/cascade-tumble` example.
      if (reelSet.isSpinning) reelSet.requestSkip();
      return;
    }
    setSpinState(true);
    try {
      cfg.beforeSpin?.(engine);
      const { symbols, anticipationReels, meta } = engine.next();
      api.setStatus('Spinning…');
      const promise = reelSet.spin();
      // Fake-server window — the moment AFTER reels fall but BEFORE the
      // new ones can be filled in. Spinner shows after the 200 ms debounce
      // so short waits don't flicker.
      const waitMs = cfg.fakeServerDelay?.() ?? 240;
      const showAt = window.setTimeout(() => { cascadeSpinner.visible = true; }, 200);
      try {
        if (anticipationReels.length) reelSet.setAnticipation(anticipationReels);
        await wait(waitMs);
      } finally {
        window.clearTimeout(showAt);
        cascadeSpinner.visible = false;
      }
      reelSet.setResult(symbols);
      const result = await promise;
      api.setStatus(`Landed · ${summarize(result.symbols)}`);

      // Tumble/cascade loop — runs ONLY when the mechanic enabled `.tumble()`.
      // Uses the library's `reelSet.runCascade(...)` orchestrator: it owns
      // the detect → destroy → pause → refill loop and resolves with the
      // summary. We supply the game rules (3-in-a-row left-anchored winner
      // detection + a gravity-correct nextGrid).
      if (cfg.tumble) {
        reelSet.setDropOrder('all');
        const { chainLength } = await reelSet.runCascade({
          detectWinners: (grid) => detectWinners(grid, cfg.reelCount, cfg.visibleRows),
          nextGrid: (prev, winners) =>
            cascadeNextGrid(prev, [...winners], allSymbolIds, cfg.weights ?? {}),
          onCascade: ({ chain }) => {
            api.toast(`Cascade × ${chain}`, 'win');
          },
          maxChain: 8,
        });
        if (chainLength > 0) {
          api.setStatus(`Cascade done · ${chainLength} stage${chainLength === 1 ? '' : 's'}`);
        }
      }

      if (cfg.onLanded) {
        await cfg.onLanded({
          reelSet,
          engine,
          grid: result.symbols,
          meta: meta ?? {},
          api,
          toast: api.toast,
          requestSpin: () => new Promise<void>((resolve) => {
            setTimeout(() => { runSpin().then(resolve); }, 0);
          }),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('demoRuntime: runSpin failed', err);
      api.setStatus('Spin failed — try again.');
    } finally {
      setSpinState(false);
    }
  };
  spinBtn.addEventListener('click', () => { void runSpin(); });

  // Cheat panel — React shadcn, rendered by the sandbox
  api.mountPanel(engine, cfg.cheatTitle ?? 'Demo cheats');

  api.setStatus('Ready. Toggle a cheat, then press SPIN.');

  return () => {
    try { resizeObserver?.disconnect(); } catch (err) { console.warn('demoRuntime: observer disconnect failed', err); }
    try { spinBtn.remove(); } catch (err) { console.warn('demoRuntime: spinBtn remove failed', err); }
    try { reelSet.destroy(); } catch (err) { console.warn('demoRuntime: reelSet destroy failed', err); }
    try { app.destroy(true, { children: true }); } catch (err) { console.warn('demoRuntime: app destroy failed', err); }
  };
}

function summarize(grid: string[][]): string {
  return grid.map((col) => col.join('/')).join(' · ');
}
