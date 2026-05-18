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
} from 'lucide-react';
import { SymbolsTab } from './studio/SymbolsTab.tsx';
import { ShareDialog } from './studio/ShareDialog.tsx';
import { cn } from '@/lib/utils';
import { Kbd, KbdChord } from '@/components/ui/kbd';
import { Application, type Texture } from 'pixi.js';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
  WinPresenter,
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type ReelSet,
  type SymbolData,
} from 'pixi-reels';
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
// Upload your assets and define symbol IDs in the "Symbols" tab.
// Each symbol you configure shows up here as \`userSymbols.<id>\`.
// Hit Run (Cmd/Ctrl+Enter) to build the reels.
//
// Injected globals:
//   - ReelSetBuilder, SpeedPresets, WinPresenter
//   - RectMaskStrategy, SharedRectMaskStrategy
//   - app             — PixiJS Application (.ticker, .screen)
//   - textures        — Record<symbolId, Texture> from your uploaded assets
//   - userSymbols     — Record<symbolId, { Class, options }>; pass into r.register
//   - userSymbolData  — Record<symbolId, { unmask?: boolean }>; auto-applied at build()
//   - pickWeighted, gsap, PIXI
//
// Unmask is plumbed automatically: toggle "unmask on" on a symbol's row and
// the studio's ReelSetBuilder applies the override at .build() time. The
// engine then auto-picks SharedRectMaskStrategy so neighbouring cells aren't
// half-cropped at the column gap. You can still call .maskStrategy(new
// SharedRectMaskStrategy()) or .symbolData({...}) explicitly to override.
//
// Return { reelSet, nextResult? } from buildReels().
// ───────────────────────────────────────────────────────────────────────

function buildReels() {
  const ids = Object.keys(userSymbols);
  if (ids.length === 0) {
    throw new Error('No symbols configured. Switch to the Symbols tab and add one.');
  }

  const REELS = 5;
  const ROWS = 3;
  const SIZE = 90;

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleSymbols(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) {
        const u = userSymbols[id];
        r.register(id, u.Class, u.options);
      }
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  const weights = Object.fromEntries(ids.map((id) => [id, 1]));
  const nextResult = () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => pickWeighted(weights)),
    );

  return { reelSet, nextResult };
}
`;

interface StudioEnv {
  app: Application;
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
      const cfg: StudioConfig = persisted && persisted.code
        ? persisted
        : { code: DEFAULT_CODE, symbols: persisted?.symbols ?? [] };
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

      envRef.current = { app };
      setIsBooting(false);
      setStatus({
        kind: 'idle',
        msg: cfg.symbols.length === 0
          ? 'No symbols yet — open the Symbols tab to add one, then press Run.'
          : 'Press Run to mount the reels.',
      });
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
  useEffect(() => {
    if (!config) return;
    const handle = setTimeout(() => {
      void saveConfig(config).catch(() => { /* persistence is best-effort */ });
    }, 300);
    return () => clearTimeout(handle);
  }, [config]);

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
      const factory = new AsyncFunction(
        'ReelSetBuilder',
        'SpeedPresets',
        'WinPresenter',
        'RectMaskStrategy',
        'SharedRectMaskStrategy',
        'app',
        'textures',
        'userSymbols',
        'userSymbolData',
        'pickWeighted',
        'gsap',
        'PIXI',
        factorySource,
      );
      built = (await factory(
        makeStudioReelSetBuilder(injectables.userSymbolData),
        SpeedPresets,
        WinPresenter,
        RectMaskStrategy,
        SharedRectMaskStrategy,
        env.app,
        injectables.textures,
        injectables.userSymbols,
        injectables.userSymbolData,
        pickWeighted,
        gsap,
        PIXI,
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
    setStatus({
      kind: 'ok',
      msg: `Mounted. ${reelSet.reels.length} reel${reelSet.reels.length === 1 ? '' : 's'} × ${reelSet.reels[0]?.symbols.length ?? 0} slots (incl. buffers).`,
    });
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

  return (
    <div
      className={cn(
        fullscreen
          ? 'fixed inset-x-0 top-14 bottom-0 z-40 grid grid-cols-2 gap-4 bg-background p-4'
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
        {tab === 'code' && config && (
          <div className={cn(fullscreen ? 'min-h-0 flex-1' : 'h-[560px]')}>
            <Editor
              defaultLanguage="typescript"
              value={config.code}
              onChange={(v) => setCode(v ?? '')}
              theme="vs-dark"
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
          </div>
        )}

        {tab === 'symbols' && config && (
          <div className={cn(fullscreen ? 'min-h-0 flex-1' : 'h-[560px]')}>
            <SymbolsTab config={config} onChange={setConfig} />
          </div>
        )}
      </div>

      {shareOpen && config && (
        <ShareDialog config={config} onClose={() => setShareOpen(false)} />
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

