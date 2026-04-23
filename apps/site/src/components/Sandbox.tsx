/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, RotateCcw, AlertCircle, CheckCircle2, Square, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd, KbdChord } from '@/components/ui/kbd';
import { Application } from 'pixi.js';
import type { Texture } from 'pixi.js';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
  type ReelSet,
  ReelSymbol,
} from 'pixi-reels';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';
import { transform as sucraseTransform } from 'sucrase';
import { runCascade, tumbleToGrid, diffCells } from '../../../../examples/shared/cascadeLoop.ts';

class EmptySymbol extends ReelSymbol {
  protected onActivate(_symbolId: string): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(_w: number, _h: number): void {}
}

const DEFAULT_CODE = `// ─── pixi-reels sandbox ─────────────────────────────────────────────────
// Edit this code and press "Run" (or Cmd/Ctrl+Enter). The reels on the
// right rebuild from your \`buildReels\` function.
//
// Injected globals:
//   - ReelSetBuilder, SpeedPresets, BlurSpriteSymbol
//   - app          -- PixiJS Application (has .ticker, .screen)
//   - textures     -- Record<symbolId, Texture>    (base art)
//   - blurTextures -- Record<symbolId, Texture>    (motion-blur variants)
//   - SYMBOL_IDS   -- string[] of every available prototype atlas id
//   - pickWeighted(weights) -- weighted random sampler
//   - gsap, PIXI   -- animation + full PixiJS namespace
//   - runCascade, tumbleToGrid, diffCells -- cascade sequence helpers
//   - EmptySymbol  -- blank ReelSymbol subclass (for hold-and-win patterns)
//
// Return { reelSet, nextResult? } — \`nextResult()\` is called each spin.
// Or return { onSpin } for a fully custom spin handler.
// ───────────────────────────────────────────────────────────────────────

function buildReels() {
  const REELS = 5;
  const ROWS = 3;
  const SIZE = 90;

  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2',
    'square/square_1', 'wild/wild_1', 'feature/feature_1',
  ];

  const weights: Record<string, number> = {
    'round/round_1': 18, 'round/round_2': 18, 'round/round_3': 18,
    'royal/royal_1': 12, 'royal/royal_2': 12,
    'square/square_1': 10, 'wild/wild_1': 3, 'feature/feature_1': 7,
  };

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleSymbols(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) {
        r.register(id, BlurSpriteSymbol, {
          textures,
          blurTextures,
        });
      }
    })
    .weights(weights)
    .symbolData({
      'wild/wild_1': { zIndex: 5 },       // wild renders above neighbours
      'feature/feature_1': { zIndex: 8 }, // bonus even higher
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .ticker(app.ticker)
    .build();

  // Try these per-spin tweaks:
  // reelSet.setStopDelays([0, 140, 280, 600, 1100]); // dramatic last reel
  // reelSet.setAnticipation([3, 4]);                 // tease on reels 3 & 4

  const nextResult = () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => pickWeighted(weights)),
    );

  return { reelSet, nextResult };
}
`;

interface SandboxEnv {
  app: Application;
  textures: Record<string, Texture>;
  blurTextures: Record<string, Texture>;
  SYMBOL_IDS: string[];
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

export default function Sandbox() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const envRef = useRef<SandboxEnv | null>(null);
  const currentReelSetRef = useRef<ReelSet | null>(null);
  const nextResultRef = useRef<(() => string[][]) | null>(null);
  const onSpinRef = useRef<(() => Promise<void>) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const hashCode = typeof location !== 'undefined' && location.hash.startsWith('#code=')
    ? decodeURIComponent(escape(atob(location.hash.slice(6))))
    : null;

  const [code, setCode] = useState(hashCode ?? DEFAULT_CODE);
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg: string }>({ kind: 'idle', msg: 'Press Run to mount the reels.' });
  const [isBooting, setIsBooting] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [speedName, setSpeedName] = useState('normal');

  // ── One-time boot: PixiJS app + prototype atlas ─────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = canvasHostRef.current;
      if (!host) return;

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

      const { textures, blurTextures } = await loadPrototypeSymbols();
      if (cancelled) return;

      const SYMBOL_IDS = Object.keys(textures);

      envRef.current = { app, textures, blurTextures, SYMBOL_IDS };
      setIsBooting(false);
      void run(code);
    })();

    return () => {
      cancelled = true;
      try { cleanupRef.current?.(); } catch { /* ignore */ }
      try { currentReelSetRef.current?.destroy(); } catch { /* ignore */ }
      currentReelSetRef.current = null;
      if (envRef.current) {
        try { envRef.current.app.destroy(true, { children: true }); } catch { /* ignore */ }
        envRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Compile + execute the user's code ───────────────────────────────
  async function run(src: string): Promise<void> {
    const env = envRef.current;
    if (!env) return;

    // Tear down current state
    try { cleanupRef.current?.(); } catch { /* ignore */ }
    try { currentReelSetRef.current?.destroy(); } catch { /* ignore */ }
    currentReelSetRef.current = null;
    nextResultRef.current = null;
    onSpinRef.current = null;
    cleanupRef.current = null;

    // Transpile TS → JS (types stripped, no type-checking)
    let js: string;
    try {
      js = sucraseTransform(src, { transforms: ['typescript'] }).code;
    } catch (e) {
      setStatus({ kind: 'err', msg: `Compile error: ${(e as Error).message}` });
      return;
    }

    // Execute with injected globals. The user code is expected to define a
    // `buildReels()` function and return its result from the outer factory.
    const factorySource = `
      "use strict";
      ${js}
      return buildReels();
    `;

    let built: BuildResult;
    try {
      const factory = new Function(
        'ReelSetBuilder',
        'SpeedPresets',
        'BlurSpriteSymbol',
        'app',
        'textures',
        'blurTextures',
        'SYMBOL_IDS',
        'pickWeighted',
        'gsap',
        'PIXI',
        'runCascade',
        'tumbleToGrid',
        'diffCells',
        'EmptySymbol',
        factorySource,
      );
      built = factory(
        ReelSetBuilder,
        SpeedPresets,
        BlurSpriteSymbol,
        env.app,
        env.textures,
        env.blurTextures,
        env.SYMBOL_IDS,
        pickWeighted,
        gsap,
        PIXI,
        runCascade,
        tumbleToGrid,
        diffCells,
        EmptySymbol,
      ) as BuildResult;
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

    // Fit the reelSet into the canvas — scale down if it overflows the
    // available area, never upscale past 1. Re-applied on every resize so
    // users can build 10×10 grids and they stay on-screen.
    const PADDING = 24;
    const fitReel = () => {
      const nativeW = reelSet.width || 1;
      const nativeH = reelSet.height || 1;
      // reelSet.width/height already include the current scale; divide by
      // current scale to recover the unscaled dimensions.
      const rawW = nativeW / (reelSet.scale.x || 1);
      const rawH = nativeH / (reelSet.scale.y || 1);
      const availW = Math.max(40, env.app.screen.width - PADDING * 2);
      const availH = Math.max(40, env.app.screen.height - PADDING * 2);
      const scale = Math.min(1, availW / rawW, availH / rawH);
      reelSet.scale.set(scale);
      reelSet.x = (env.app.screen.width - rawW * scale) / 2;
      reelSet.y = (env.app.screen.height - rawH * scale) / 2;
    };
    env.app.stage.removeChildren();
    env.app.stage.addChild(reelSet);
    fitReel();
    const onResize = () => fitReel();
    env.app.renderer.on('resize', onResize);
    // Detach the listener on tear-down so re-runs don't leak handlers.
    const origDestroy = reelSet.destroy.bind(reelSet);
    reelSet.destroy = function patched(...args: unknown[]) {
      try { env.app.renderer.off('resize', onResize); } catch { /* ignore */ }
      return origDestroy(...(args as []));
    };

    currentReelSetRef.current = reelSet;
    nextResultRef.current = built.nextResult ?? null;

    // Sync speed selector with the built reelSet's available profiles
    try {
      const names = reelSet.speed.profileNames;
      if (!names.includes(speedName) && names[0]) {
        setSpeedName(names[0]);
        reelSet.setSpeed(names[0]);
      } else {
        reelSet.setSpeed(speedName);
      }
    } catch { /* ignore */ }

    setStatus({ kind: 'ok', msg: `Mounted. ${reelSet.reels.length} reel${reelSet.reels.length === 1 ? '' : 's'} × ${reelSet.reels[0]?.symbols.length ?? 0} slots (incl. buffers).` });
  }

  async function handleSpin() {
    if (isSpinning) {
      try { currentReelSetRef.current?.skip(); } catch { /* ignore */ }
      return;
    }
    const reelSet = currentReelSetRef.current;
    if (!reelSet && !onSpinRef.current) return;
    setIsSpinning(true);
    try {
      if (onSpinRef.current) {
        await onSpinRef.current();
      } else {
        const spinPromise = reelSet!.spin();
        const result = nextResultRef.current?.();
        await new Promise((r) => setTimeout(r, 150));
        if (result) reelSet!.setResult(result);
        await spinPromise;
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: `Spin error: ${(e as Error).message}` });
    } finally {
      setIsSpinning(false);
    }
  }

  function handleSpeedChange(name: string) {
    setSpeedName(name);
    const rs = currentReelSetRef.current;
    if (rs) {
      try { rs.setSpeed(name); } catch { /* ignore — profile missing */ }
    }
  }

  // Ctrl/Cmd+Enter to run
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void run(code);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [code]);

  const speeds = currentReelSetRef.current?.speed.profileNames ?? ['normal', 'turbo', 'superTurbo'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,480px)] gap-4">
      {/* ── Editor pane ─── */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2">
          <button
            type="button"
            onClick={() => void run(code)}
            disabled={isBooting}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
          >
            <Play size={12} strokeWidth={2.5} /> Run
            <KbdChord className="ml-1">
              {navigator.platform.toLowerCase().includes('mac')
                ? <Kbd icon="cmd" />
                : <Kbd>Ctrl</Kbd>}
              <Kbd icon="enter" />
            </KbdChord>
          </button>
          <button
            type="button"
            onClick={() => { setCode(DEFAULT_CODE); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw size={12} strokeWidth={2.5} /> Reset
          </button>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">sandbox.ts</span>
        </div>
        <div className="h-[520px]">
          <Editor
            defaultLanguage="typescript"
            value={code}
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
          />
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
            {isBooting ? 'Loading atlas…' : status.msg}
          </span>
        </div>
      </div>

      {/* ── Canvas pane ─── */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative flex-1 min-h-[420px]">
          <div
            ref={canvasHostRef}
            className="h-full w-full bg-background"
          />
          <button
            type="button"
            onClick={() => void handleSpin()}
            disabled={isBooting || (!currentReelSetRef.current && !onSpinRef.current)}
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
        <div className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-3 py-2">
          <div className="flex items-center rounded-md border border-border bg-background/50 p-0.5">
            {speeds.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleSpeedChange(name)}
                className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  speedName === name ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
