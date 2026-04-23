import { Application, Graphics } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, enableDebug } from 'pixi-reels';
import type { ReelSet } from 'pixi-reels';
import { gsap } from 'gsap';
import { BlockSymbol } from './BlockSymbol.ts';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';
import {
  CheatEngine,
  type CheatDefinition,
} from '../../../../examples/shared/cheats.ts';
import type { DemoApi } from './DemoSandbox.tsx';

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
    | { kind: 'sprite'; ids: string[]; blurOnSpin?: boolean };
  weights?: Record<string, number>;
  cheats: CheatDefinition[];
  /** Runs after every completed spin. Return a promise for win animations. */
  onLanded?: (ctx: LandedCtx) => Promise<void> | void;
  /** Custom spin button label. */
  spinLabel?: string;
  /** Called before each spin to allow per-spin setup (e.g., setHeld). */
  beforeSpin?: (engine: CheatEngine) => void;
  /** Title rendered in the cheat panel. */
  cheatTitle?: string;
}

function normalizeSymbolConfig(
  symbols: MechanicConfig['symbols'],
): { kind: 'block'; defs: BlockSymbolDef[] } | { kind: 'sprite'; ids: string[]; blurOnSpin: boolean } {
  if (Array.isArray(symbols)) return { kind: 'block', defs: symbols };
  if (symbols.kind === 'sprite') return { kind: 'sprite', ids: symbols.ids, blurOnSpin: symbols.blurOnSpin ?? true };
  return { kind: 'block', defs: symbols.defs };
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
  // Size the PIXI canvas to the container
  const width = Math.min(
    host.clientWidth || 800,
    cfg.reelCount * (cfg.symbolSize.width + 6) + 80,
  );
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

  const reelSet = new ReelSetBuilder()
    .reels(cfg.reelCount)
    .visibleSymbols(cfg.visibleRows)
    .symbolSize(cfg.symbolSize.width, cfg.symbolSize.height)
    .symbolGap(6, 6)
    .symbols((r) => {
      if (symbolCfg.kind === 'sprite' && spriteTextures) {
        for (const id of symbolCfg.ids) {
          r.register(id, BlurSpriteSymbol, {
            textures: spriteTextures.base,
            blurTextures: spriteTextures.blur,
            anchor: { x: 0.5, y: 0.5 },
            fit: true,
          });
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
    .ticker(app.ticker)
    .build();

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

  // Frame behind the reels
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
  frame.x = (width - totalW) / 2;
  frame.y = (height - totalH) / 2;
  app.stage.addChild(frame);

  reelSet.x = frame.x + padX;
  reelSet.y = frame.y + padY;
  app.stage.addChild(reelSet);

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

  // Canonical circular slam-stop button — matches RecipeRunner / Sandbox.
  const ICON_SPIN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
  const ICON_STOP = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`;

  const spinBtn = document.createElement('button');
  spinBtn.innerHTML = ICON_SPIN;
  spinBtn.title = 'Spin';
  spinBtn.setAttribute('aria-label', 'Spin');
  spinBtn.className = [
    'absolute bottom-3 right-3',
    'inline-flex h-10 w-10 items-center justify-center rounded-full',
    'border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur',
    'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' ');
  spinBtn.style.zIndex = '5';
  host.appendChild(spinBtn);

  let spinning = false;
  const setSpinState = (on: boolean): void => {
    spinning = on;
    spinBtn.innerHTML = on ? ICON_STOP : ICON_SPIN;
    spinBtn.title = on ? 'Stop' : 'Spin';
    spinBtn.setAttribute('aria-label', on ? 'Stop' : 'Spin');
    if (on) {
      spinBtn.classList.add('bg-primary', 'text-primary-foreground', 'border-primary');
    } else {
      spinBtn.classList.remove('bg-primary', 'text-primary-foreground', 'border-primary');
    }
  };

  const runSpin = async (): Promise<void> => {
    if (spinning) {
      if (reelSet.isSpinning) reelSet.skip();
      return;
    }
    setSpinState(true);
    try {
      cfg.beforeSpin?.(engine);
      const { symbols, anticipationReels, meta } = engine.next();
      api.setStatus('Spinning…');
      const promise = reelSet.spin();
      setTimeout(() => {
        if (anticipationReels.length) reelSet.setAnticipation(anticipationReels);
        reelSet.setResult(symbols);
      }, 240);
      const result = await promise;
      api.setStatus(`Landed · ${summarize(result.symbols)}`);
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
    } finally {
      setSpinState(false);
    }
  };
  spinBtn.addEventListener('click', () => { void runSpin(); });

  // Cheat panel — React shadcn, rendered by the sandbox
  api.mountPanel(engine, cfg.cheatTitle ?? 'Demo cheats');

  api.setStatus('Ready. Toggle a cheat, then press SPIN.');

  return () => {
    try { spinBtn.remove(); } catch {}
    try { reelSet.destroy(); } catch {}
    try { app.destroy(true, { children: true }); } catch {}
  };
}

function summarize(grid: string[][]): string {
  return grid.map((col) => col.join('/')).join(' · ');
}
