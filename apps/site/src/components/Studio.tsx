/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Square,
  RefreshCw,
  Code2,
  Boxes,
  Maximize2,
  Minimize2,
  Share2,
  Eye,
  Gauge,
  X,
} from 'lucide-react';
import { SymbolsTab } from './studio/SymbolsTab.tsx';
import { ShareDialog } from './studio/ShareDialog.tsx';
import { CanvasSkeleton } from './CanvasSkeleton.tsx';
import { useMinDisplay } from './useMinDisplay.ts';
import { cn } from '@/lib/utils';
import { Kbd, KbdChord } from '@/components/ui/kbd';
import { Application, type Texture } from 'pixi.js';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  SpriteSymbol,
  AnimatedSpriteSymbol,
  enableDebug,
  WinPresenter,
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type ReelSet,
  type SymbolData,
  ReelSymbol,
} from 'pixi-reels';
import { SpineReelSymbol } from 'pixi-reels/spine';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { CardSymbol, CARD_DECK, WILD_CARD } from '../../../../examples/shared/CardSymbol.ts';
import { EmptySymbol } from '../../../../examples/shared/EmptySymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';
import {
  loadGeneratedSpines,
  buildSpineMap,
} from '../../../../examples/shared/generatedSpineLoader.ts';
import { transform as sucraseTransform } from 'sucrase';
import {
  loadConfig,
  saveConfig,
} from '@/lib/studio/db.js';
import {
  applyStudioConfig,
  revokeBlobUrls,
  type StudioInjectables,
  type UserSymbolBinding,
} from '@/lib/studio/applyConfig.js';
import type { StudioConfig } from '@/lib/studio/types.js';


const DEFAULT_CODE = `// @ts-nocheck
// ─── pixi-reels studio ─────────────────────────────────────────────────
// Edit this code and press Run (Cmd/Ctrl+Enter). Recipes from /recipes/*
// open here too — anything that runs in a recipe runs here.
//
// Built-in globals (ready out of the box):
//   - ReelSetBuilder, SpeedPresets, WinPresenter
//   - SpriteSymbol, AnimatedSpriteSymbol, BlurSpriteSymbol
//   - CardSymbol, CARD_DECK, WILD_CARD  (graphics-only debug cards)
//   - SpineReelSymbol, loadGeneratedSpines, buildSpineMap
//   - RectMaskStrategy, SharedRectMaskStrategy
//   - EmptySymbol, ReelSymbol
//   - app          — PixiJS Application (.ticker, .screen)
//   - textures, blurTextures, SYMBOL_IDS  — prototype atlas, preloaded
//   - pickWeighted, gsap, PIXI
//
// Bring-your-own assets (Symbols tab):
//   - userSymbols     — Record<id, { Class, options }> from your uploads
//   - userSymbolData  — Record<id, { unmask?: boolean }>, auto-applied
//
// Return { reelSet, nextResult? } from buildReels(). Or return { onSpin }
// for a fully custom spin handler.
// ───────────────────────────────────────────────────────────────────────

function buildReels() {
  const SYMBOLS = [...CARD_DECK, WILD_CARD];
  const weights = {
    '7': 20, '8': 20, '9': 20, '10': 14, J: 14, Q: 10, K: 6, A: 5, wild: 3,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5)
    .visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const sym of SYMBOLS) {
        r.register(sym.id, CardSymbol, {
          color: sym.color,
          label: sym.label,
          textColor: sym.textColor,
        });
      }
    })
    .weights(weights)
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  return {
    reelSet,
    nextResult: () =>
      Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => pickWeighted(weights)),
      ),
  };
}
`;

interface StudioEnv {
  app: Application;
  textures: Record<string, Texture>;
  blurTextures: Record<string, Texture>;
  SYMBOL_IDS: string[];
}

/**
 * Read `#code=<base64>` from `location.hash` once on mount. Returns the
 * decoded source (or null), and clears the hash from the URL so a refresh
 * doesn't re-trigger the recipe-open prompt. Mirrors the encoder in
 * RecipeRunner's `openInStudio()`.
 */
function consumeHashCode(): string | null {
  if (typeof location === 'undefined') return null;
  if (!location.hash.startsWith('#code=')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(escape(atob(location.hash.slice(6))));
  } catch {
    return null;
  }
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch { /* ignore */ }
  return decoded;
}

interface BuildResult {
  reelSet?: ReelSet;
  nextResult?: () => string[][];
  onSpin?: () => Promise<void>;
  cleanup?: () => void;
}

function pickWeighted(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [id, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return id;
  }
  return Object.keys(weights)[0];
}

/**
 * Subclass of ReelSetBuilder injected into the studio's user code in
 * place of the engine's. Auto-applies the per-symbol overrides from the
 * Symbols tab (currently: `unmask`) in `.build()`, so the user doesn't
 * have to remember `.symbolData(userSymbolData)` themselves. The
 * Symbols-tab UI is the source of truth for these flags — if the user
 * also calls `.symbolData(...)` manually with the same id, the merge
 * order in ReelSetBuilder.symbolData (line 309: spread merge) means
 * our studio data wins. That matches user intent: toggling the row
 * should always reflect on the running reels.
 *
 * Bundling the overrides into a factory-built subclass keeps user code
 * looking exactly like sandbox/recipe code (`new ReelSetBuilder()` with
 * no args) — no studio-specific API to learn.
 */
function makeStudioReelSetBuilder(
  studioOverrides: Record<string, Partial<SymbolData>>,
): typeof ReelSetBuilder {
  if (Object.keys(studioOverrides).length === 0) return ReelSetBuilder;
  return class StudioReelSetBuilder extends ReelSetBuilder {
    override build(): ReelSet {
      this.symbolData(studioOverrides);
      return super.build();
    }
  } as typeof ReelSetBuilder;
}

type TabId = 'code' | 'symbols';

export default function Studio() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const envRef = useRef<StudioEnv | null>(null);
  const reelSetRef = useRef<ReelSet | null>(null);
  const nextResultRef = useRef<(() => string[][]) | null>(null);
  const onSpinRef = useRef<(() => Promise<void>) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastInjectablesRef = useRef<StudioInjectables | null>(null);
  // Set by `run()` to a closure that recentres + scales the current reelSet
  // inside the (possibly-resized) canvas pane. Called from the ResizeObserver
  // so layout changes (fullscreen toggle, panel resize, window resize) all
  // refit through a single path.
  const fitRef = useRef<(() => void) | null>(null);

  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [tab, setTab] = useState<TabId>('code');
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg: string }>(
    { kind: 'idle', msg: 'Loading studio…' },
  );
  const [isBooting, setIsBooting] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Speed selector. Populated from `reelSet.speed.profileNames` on every
  // Run so the segmented control reflects whatever the user's builder
  // registered — `.speed('mySpeed', ...)` in user code shows up
  // automatically. Empty until the first successful Run.
  const [speeds, setSpeeds] = useState<string[]>([]);
  const [speedName, setSpeedName] = useState<string>('normal');

  // Latched boot flag — keep the skeleton on screen for at least 250 ms
  // after first paint so very fast IDB+atlas loads don't flash a 1-frame
  // skeleton. Mirrors RecipeRunner's pattern.
  const showSkeleton = useMinDisplay(isBooting, 250);
  // Set when a recipe link (#code=…) arrives and we already have saved work
  // in IDB — opens the overwrite/preview/cancel modal. While non-null the
  // user hasn't decided yet; the persisted config stays untouched.
  const [pendingHashCode, setPendingHashCode] = useState<string | null>(null);
  // Set when an incoming recipe should auto-run as soon as boot completes
  // and the new code is in `config`. Set in three places:
  //   1. boot effect, when a #code= hash arrives with no prior work
  //   2. Replace action in the RecipePrompt modal
  //   3. Preview action in the RecipePrompt modal
  // Cancel doesn't set it (the user kept their existing code; they didn't
  // ask to run anything).
  const [pendingAutoRun, setPendingAutoRun] = useState<boolean>(false);
  // True while previewing a recipe loaded via "Preview only" — disables the
  // debounced save effect so the user's saved Studio code in IDB is preserved.
  const [isEphemeral, setIsEphemeral] = useState(false);

  // ESC exits fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fullscreen]);

  // ── Load persisted config + boot Pixi ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const host = canvasHostRef.current;
      if (!host) return;

      const persisted = await loadConfig().catch(() => null);
      const hashCode = consumeHashCode();
      const hasPriorWork = !!(persisted && (persisted.code || persisted.symbols.length > 0));

      // Three landing states:
      //   1. hash + prior work → load persisted as initial; prompt user to pick
      //      replace / preview-only / cancel before applying the hash code.
      //   2. hash + no prior work → just use the hash code directly (first
      //      visit), persistence kicks in via the debounced save effect.
      //   3. no hash → normal flow.
      let cfg: StudioConfig;
      if (hashCode && hasPriorWork) {
        cfg = persisted!;
        setPendingHashCode(hashCode);
      } else if (hashCode) {
        cfg = { code: hashCode, symbols: persisted?.symbols ?? [] };
        setPendingAutoRun(true);
      } else {
        cfg = persisted && persisted.code
          ? persisted
          : { code: DEFAULT_CODE, symbols: persisted?.symbols ?? [] };
      }
      if (cancelled) return;
      setConfig(cfg);

      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });
      if (cancelled) { app.destroy(true, { children: true }); return; }

      try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
      app.ticker.add((t) => gsap.updateRoot(t.lastTime / 1000));

      host.innerHTML = '';
      host.appendChild(app.canvas);

      // Preload the prototype atlas so recipe-style code (BlurSpriteSymbol +
      // `textures` lookups) works without any explicit loader call.
      const { textures, blurTextures } = await loadPrototypeSymbols();
      if (cancelled) return;

      envRef.current = {
        app,
        textures,
        blurTextures,
        SYMBOL_IDS: Object.keys(textures),
      };
      setIsBooting(false);
      setStatus({ kind: 'idle', msg: 'Press Run to mount the reels.' });
    })();

    // Refit whenever the canvas pane changes size. PixiJS's `resizeTo: host`
    // only listens on window resize; CSS layout swaps (the fullscreen
    // toggle, future panel drags) leave the renderer with stale dimensions.
    // ResizeObserver fires for all of those.
    const host = canvasHostRef.current;
    let observer: ResizeObserver | null = null;
    if (host && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const env = envRef.current;
        if (!env) return;
        try { env.app.resize(); } catch { /* ignore */ }
        fitRef.current?.();
      });
      observer.observe(host);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      teardownRun();
      if (envRef.current) {
        try { envRef.current.app.destroy(true, { children: true }); } catch { /* ignore */ }
        envRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist config changes (debounced) ─────────────────────────────
  // Skip while previewing a recipe (`isEphemeral`) so the user's saved
  // Studio code in IDB stays intact until they explicitly save.
  useEffect(() => {
    if (!config || isEphemeral) return;
    const handle = setTimeout(() => {
      void saveConfig(config).catch(() => { /* persistence is best-effort */ });
    }, 300);
    return () => clearTimeout(handle);
  }, [config, isEphemeral]);

  function setCode(next: string): void {
    setConfig((c) => (c ? { ...c, code: next } : c));
  }

  function teardownRun(): void {
    try { cleanupRef.current?.(); } catch { /* ignore */ }
    try { reelSetRef.current?.destroy(); } catch { /* ignore */ }
    reelSetRef.current = null;
    nextResultRef.current = null;
    onSpinRef.current = null;
    cleanupRef.current = null;
    fitRef.current = null;
    if (lastInjectablesRef.current) {
      revokeBlobUrls(lastInjectablesRef.current.blobUrls);
      lastInjectablesRef.current = null;
    }
  }

  // ── Run: apply config → transpile code → exec → mount ──────────────
  async function run(): Promise<void> {
    const env = envRef.current;
    if (!env || !config) return;

    teardownRun();

    let injectables: StudioInjectables;
    try {
      injectables = await applyStudioConfig(config);
    } catch (e) {
      setStatus({ kind: 'err', msg: `Asset error: ${(e as Error).message}` });
      return;
    }
    lastInjectablesRef.current = injectables;

    let js: string;
    try {
      js = sucraseTransform(config.code, { transforms: ['typescript'] }).code;
    } catch (e) {
      setStatus({ kind: 'err', msg: `Compile error: ${(e as Error).message}` });
      return;
    }

    const factorySource = `"use strict"; ${js} ; return buildReels();`;
    let built: BuildResult;
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
      // Keep this param list in lock-step with RecipeRunner.tsx and
      // ShareViewer.tsx — anything a recipe references must be injected
      // identically across all three runtimes, otherwise "Open in Studio"
      // (and shared studios using recipe-style code) produce
      // "Can't find variable: X" at run time.
      const factory = new AsyncFunction(
        'ReelSetBuilder', 'SpeedPresets', 'BlurSpriteSymbol', 'SpriteSymbol', 'AnimatedSpriteSymbol',
        'WinPresenter',
        'app', 'textures', 'blurTextures', 'SYMBOL_IDS', 'pickWeighted', 'gsap', 'PIXI',
        'EmptySymbol', 'ReelSymbol',
        'RectMaskStrategy', 'SharedRectMaskStrategy',
        'CardSymbol', 'CARD_DECK', 'WILD_CARD',
        'SpineReelSymbol', 'loadGeneratedSpines', 'buildSpineMap',
        'userSymbols', 'userSymbolData',
        factorySource,
      );
      // User uploads merge into `textures` so recipe-style `textures[id]`
      // lookups also pick them up; ids collide → studio uploads win.
      const mergedTextures = { ...env.textures, ...injectables.textures };
      built = (await factory(
        makeStudioReelSetBuilder(injectables.userSymbolData),
        SpeedPresets, BlurSpriteSymbol, SpriteSymbol, AnimatedSpriteSymbol,
        WinPresenter,
        env.app, mergedTextures, env.blurTextures, env.SYMBOL_IDS, pickWeighted, gsap, PIXI,
        EmptySymbol, ReelSymbol,
        RectMaskStrategy, SharedRectMaskStrategy,
        CardSymbol, CARD_DECK, WILD_CARD,
        SpineReelSymbol, loadGeneratedSpines, buildSpineMap,
        injectables.userSymbols, injectables.userSymbolData,
      )) as BuildResult;
    } catch (e) {
      setStatus({ kind: 'err', msg: `Runtime error: ${(e as Error).message}` });
      return;
    }

    if (!built || (!built.reelSet && !built.onSpin)) {
      setStatus({ kind: 'err', msg: 'buildReels() must return { reelSet } or { onSpin }.' });
      return;
    }

    onSpinRef.current = built.onSpin ?? null;
    cleanupRef.current = built.cleanup ?? null;

    if (!built.reelSet) {
      setStatus({ kind: 'ok', msg: 'Mounted. Custom spin handler active.' });
      return;
    }

    const reelSet = built.reelSet;
    enableDebug(reelSet);

    const PADDING = 24;
    // Aspect-preserving fit. Upscales freely so the reels look right in a
    // fullscreen canvas pane (with the previous Math.min(1, …) clamp they
    // looked tiny in the middle). Always re-derives raw dimensions from
    // post-divide-by-scale so successive refits don't compound.
    const fit = () => {
      const rawW = reelSet.width / (reelSet.scale.x || 1);
      const rawH = reelSet.height / (reelSet.scale.y || 1);
      const availW = Math.max(40, env.app.screen.width - PADDING * 2);
      const availH = Math.max(40, env.app.screen.height - PADDING * 2);
      const scale = Math.min(availW / rawW, availH / rawH);
      reelSet.scale.set(scale);
      reelSet.x = (env.app.screen.width - rawW * scale) / 2;
      reelSet.y = (env.app.screen.height - rawH * scale) / 2;
    };
    env.app.stage.removeChildren();
    env.app.stage.addChild(reelSet);
    fit();
    // The boot useEffect's ResizeObserver calls through this ref on every
    // host-size change — single fit path for window resize, fullscreen
    // toggle, and future panel drags.
    fitRef.current = fit;

    reelSetRef.current = reelSet;
    nextResultRef.current = built.nextResult ?? null;

    // Sync the speed selector with whatever the user's builder registered.
    // If the previously-selected name still exists we keep it (so toggling
    // turbo and re-Running doesn't snap back to normal); otherwise fall
    // back to the engine's active profile.
    try {
      const names = reelSet.speed.profileNames;
      setSpeeds(names);
      const next = names.includes(speedName) ? speedName : reelSet.speed.activeName;
      if (next !== speedName) setSpeedName(next);
      if (next !== reelSet.speed.activeName) reelSet.setSpeed(next);
    } catch { /* ignore — builder didn't register any profiles */ }

    setStatus({
      kind: 'ok',
      msg: `Mounted. ${reelSet.reels.length} reel${reelSet.reels.length === 1 ? '' : 's'} × ${reelSet.reels[0]?.symbols.length ?? 0} slots (incl. buffers).`,
    });
  }

  function handleSpeedChange(name: string): void {
    setSpeedName(name);
    try { reelSetRef.current?.setSpeed(name); } catch { /* ignore — profile missing */ }
  }

  async function handleSpin(): Promise<void> {
    if (isSpinning) {
      // skip() THROWS before `setResult()` arrives — route to requestSkip()
      // in the catch so a player tap during the server-wait window still
      // queues the slam and fires it the moment the result is in.
      try { reelSetRef.current?.skip(); }
      catch { reelSetRef.current?.requestSkip(); }
      return;
    }
    if (!reelSetRef.current && !onSpinRef.current) return;
    setIsSpinning(true);
    try {
      if (onSpinRef.current) {
        await onSpinRef.current();
      } else if (reelSetRef.current) {
        const p = reelSetRef.current.spin();
        const result = nextResultRef.current?.();
        await new Promise((r) => setTimeout(r, 150));
        if (result) reelSetRef.current.setResult(result);
        await p;
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: `Spin error: ${(e as Error).message}` });
    } finally {
      setIsSpinning(false);
    }
  }

  // Cmd/Ctrl+Enter triggers Run from the Code tab.
  useEffect(() => {
    if (tab !== 'code') return;
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, config]);

  // Auto-run a freshly applied recipe once boot is done and the new code
  // has reached `config`. Fires once per pending request; cleared
  // immediately so a manual config change later doesn't re-trigger.
  useEffect(() => {
    if (!pendingAutoRun || isBooting || !envRef.current || !config) return;
    setPendingAutoRun(false);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoRun, isBooting, config]);

  // ── Recipe-prompt actions ──────────────────────────────────────────
  function applyHashCode(code: string, ephemeral: boolean): void {
    setConfig((c) => (c ? { ...c, code } : c));
    setIsEphemeral(ephemeral);
    setPendingHashCode(null);
    setTab('code');
    // Recipes are meant to be seen running, not just read. Schedule an
    // auto-run that fires once the next render's `config` has propagated
    // and boot is complete.
    setPendingAutoRun(true);
  }
  // Exit preview: reload the saved config from IDB so the recipe code in
  // memory is discarded. Re-runs Pixi-side teardown on next Run.
  async function discardPreview(): Promise<void> {
    const persisted = await loadConfig().catch(() => null);
    const cfg = persisted && persisted.code
      ? persisted
      : { code: DEFAULT_CODE, symbols: persisted?.symbols ?? [] };
    setConfig(cfg);
    setIsEphemeral(false);
  }
  // Flip ephemeral off so the debounced save effect picks up the current
  // (recipe) code and writes it to IDB on the next change tick.
  function savePreviewAsStudio(): void {
    setIsEphemeral(false);
  }

  return (
    <div className={cn('flex flex-col gap-3', fullscreen && 'fixed inset-x-0 top-14 bottom-0 z-40 bg-background p-4')}>
      {isEphemeral && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Eye size={13} className="flex-shrink-0" />
          <span>Previewing a recipe — changes won't be saved to your Studio.</span>
          <button
            type="button"
            onClick={savePreviewAsStudio}
            className="ml-auto rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            Save to my Studio
          </button>
          <button
            type="button"
            onClick={() => void discardPreview()}
            className="rounded-md border border-amber-400/40 px-2 py-0.5 text-amber-100 hover:bg-amber-500/10"
          >
            Discard
          </button>
        </div>
      )}

      <div
        className={cn(
          fullscreen
            ? 'grid flex-1 grid-cols-2 gap-4 min-h-0'
            : 'grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,520px)]',
        )}
      >
      {/* ── Canvas pane ─── */}
      <div className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card',
        fullscreen && 'min-h-0',
      )}>
        <div className={cn('relative flex-1', !fullscreen && 'min-h-[480px]')}>
          <div ref={canvasHostRef} className="h-full w-full bg-background" />
          {showSkeleton && <CanvasSkeleton label="Loading studio…" />}
          {speeds.length > 1 && (
            <div
              role="radiogroup"
              aria-label="Spin speed"
              className={cn(
                'absolute bottom-3 left-3 inline-flex items-center gap-0.5 rounded-full',
                'border border-border/70 bg-background/80 p-0.5 pl-2 shadow-sm backdrop-blur',
              )}
            >
              <Gauge size={12} strokeWidth={2.25} className="mr-1 flex-shrink-0 text-muted-foreground" />
              {speeds.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={speedName === name}
                  onClick={() => handleSpeedChange(name)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors',
                    speedName === name
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleSpin()}
            disabled={isBooting || (!reelSetRef.current && !onSpinRef.current)}
            title={isSpinning ? 'Stop' : 'Spin'}
            aria-label={isSpinning ? 'Stop' : 'Spin'}
            className={cn(
              'absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full',
              'border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur',
              'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
              isSpinning && 'bg-primary text-primary-foreground border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isSpinning ? <Square size={14} strokeWidth={2.5} /> : <RefreshCw size={16} strokeWidth={2.25} />}
          </button>
        </div>
        <div className="flex items-start gap-2 border-t border-border/60 bg-background/40 px-3 py-2 text-xs">
          {status.kind === 'err' ? (
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-destructive" />
          ) : status.kind === 'ok' ? (
            <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald-500" />
          ) : (
            <div className="mt-0.5 h-[13px] w-[13px] flex-shrink-0 rounded-full border border-muted-foreground/40" />
          )}
          <span className={status.kind === 'err' ? 'text-destructive' : 'text-muted-foreground'}>
            {isBooting ? 'Loading studio…' : status.msg}
          </span>
        </div>
      </div>

      {/* ── Editor pane ─── */}
      <div className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card',
        fullscreen && 'min-h-0',
      )}>
        {/* Tab strip */}
        <div className="flex items-center gap-1 border-b border-border/60 bg-background/40 px-2 pt-2">
          <TabButton active={tab === 'code'} onClick={() => setTab('code')} icon={<Code2 size={12} />}>
            Code
          </TabButton>
          <TabButton active={tab === 'symbols'} onClick={() => setTab('symbols')} icon={<Boxes size={12} />}>
            Symbols
            {config && config.symbols.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {config.symbols.length}
              </span>
            )}
          </TabButton>

          <div className="ml-auto flex items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={isBooting || !config}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
            >
              <Play size={12} strokeWidth={2.5} /> Run
              <KbdChord className="ml-1">
                {typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
                  ? <Kbd icon="cmd" />
                  : <Kbd>Ctrl</Kbd>}
                <Kbd icon="enter" />
              </KbdChord>
            </button>
            <button
              type="button"
              onClick={() => setCode(DEFAULT_CODE)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Reset code to the default template"
            >
              <RotateCcw size={12} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              title={fullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen — Monaco and reels fill the viewport 50/50'}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {fullscreen ? <Minimize2 size={12} strokeWidth={2.5} /> : <Maximize2 size={12} strokeWidth={2.5} />}
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              disabled={!config || config.symbols.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Share this studio — uploads encrypted to the share-api, gives you a link"
              aria-label="Share"
            >
              <Share2 size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Tab body */}
        {tab === 'code' && (
          <div className={cn(fullscreen ? 'min-h-0 flex-1' : 'h-[560px]')}>
            {config ? (
              <Editor
                defaultLanguage="typescript"
                value={config.code}
                onChange={(v) => setCode(v ?? '')}
                theme="vs-dark"
                loading={<EditorSkeleton />}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  renderWhitespace: 'selection',
                  padding: { top: 10, bottom: 10 },
                }}
                onMount={(_editor, monaco) => {
                  // Injected globals (ReelSetBuilder, userSymbols, app, …)
                  // aren't declared anywhere Monaco can resolve, so semantic
                  // diagnostics produce a sea of red squiggles. The code is
                  // transpiled at Run via sucrase (types stripped, no
                  // type-checking), so these errors aren't real — silence
                  // them here. Syntax errors still surface.
                  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: true,
                    noSyntaxValidation: false,
                  });
                }}
              />
            ) : (
              <EditorSkeleton />
            )}
          </div>
        )}

        {tab === 'symbols' && (
          <div className={cn(fullscreen ? 'min-h-0 flex-1' : 'h-[560px]')}>
            {config ? <SymbolsTab config={config} onChange={setConfig} /> : <EditorSkeleton />}
          </div>
        )}
      </div>

      </div>

      {shareOpen && config && (
        <ShareDialog config={config} onClose={() => setShareOpen(false)} />
      )}

      {pendingHashCode !== null && (
        <RecipePrompt
          onCancel={() => setPendingHashCode(null)}
          onReplace={() => applyHashCode(pendingHashCode, false)}
          onPreview={() => applyHashCode(pendingHashCode, true)}
        />
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function TabButton({ active, onClick, icon, children }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs transition-colors',
        active
          ? 'border-primary font-semibold text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// Code-line placeholder shown in the editor pane while:
//   (1) the persisted StudioConfig is still loading from IndexedDB
//   (2) Monaco's own worker bundle is still downloading
// Matches Monaco's `vs-dark` background so the swap is invisible. Pulse
// delays stagger top-to-bottom so the eye sees motion rather than a
// static grey block.
const EDITOR_LINE_WIDTHS = [38, 64, 28, 80, 52, 58, 22, 72, 44, 78, 50, 34, 60, 26, 70];

function EditorSkeleton(): JSX.Element {
  return (
    <div
      className="flex h-full w-full overflow-hidden bg-[#1e1e1e]"
      role="status"
      aria-label="Loading editor"
    >
      <div className="flex w-10 flex-col gap-2.5 py-3 pr-2" aria-hidden>
        {EDITOR_LINE_WIDTHS.map((_, i) => (
          <div
            key={i}
            className="h-2.5 w-2.5 self-end rounded-sm bg-white/10 animate-pulse"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 py-3 pl-2 pr-4" aria-hidden>
        {EDITOR_LINE_WIDTHS.map((w, i) => (
          <div
            key={i}
            className="h-2.5 rounded-sm bg-white/10 animate-pulse"
            style={{ width: `${w}%`, animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

interface RecipePromptProps {
  onCancel: () => void;
  onReplace: () => void;
  onPreview: () => void;
}

function RecipePrompt({ onCancel, onReplace, onPreview }: RecipePromptProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="text-sm font-semibold">Open recipe in Studio?</div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <p className="text-muted-foreground">
            You already have code saved in Studio. Replace it with the recipe, or load
            the recipe as a read-only preview without touching your saved code.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onReplace}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
            >
              Replace saved code
            </button>
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-2 text-xs text-foreground hover:bg-secondary/50"
            >
              <Eye size={12} /> Preview only — don't save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/60 bg-transparent px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

