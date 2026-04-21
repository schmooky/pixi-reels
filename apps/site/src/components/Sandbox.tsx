/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Kbd, KbdChord } from '@/components/ui/kbd';
import { Application } from 'pixi.js';
import {
  compileAndBuild,
  runSpin,
  ensurePrototypeAtlas,
  syncGsap,
  type BuildResult,
  type SandboxEnv,
} from './recipeExec.ts';
import { getRecipeCode } from './recipeRegistry.ts';

/**
 * Fallback code if no `?recipe=<slug>` param was supplied AND the
 * registry somehow has no classic-5x3 fallback. Minimal to keep
 * this component's bundle small.
 */
const MINIMAL_FALLBACK = `function buildReels() {
  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90).symbolGap(4, 4)
    .symbols((r) => r.register('royal/royal_1', BlurSpriteSymbol, { textures, blurTextures }))
    .weights({ 'royal/royal_1': 1 })
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker)
    .build();
  return { reelSet, cancel: () => reelSet.skip() };
}
`;

function pickInitialCode(): string {
  if (typeof window === 'undefined') return getRecipeCode('classic-5x3') ?? MINIMAL_FALLBACK;
  const slug = new URLSearchParams(window.location.search).get('recipe');
  if (slug) return getRecipeCode(slug) ?? (getRecipeCode('classic-5x3') ?? MINIMAL_FALLBACK);
  return getRecipeCode('classic-5x3') ?? MINIMAL_FALLBACK;
}

export default function Sandbox() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const envRef = useRef<SandboxEnv | null>(null);
  const builtRef = useRef<BuildResult | null>(null);

  const [code, setCode] = useState(pickInitialCode);
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
      syncGsap(app);

      host.innerHTML = '';
      host.appendChild(app.canvas);

      const atlas = await ensurePrototypeAtlas();
      if (cancelled) return;

      envRef.current = {
        app,
        textures: atlas.textures,
        blurTextures: atlas.blurTextures,
        SYMBOL_IDS: Object.keys(atlas.textures),
      };
      setIsBooting(false);
      void run(code);
    })();

    return () => {
      cancelled = true;
      if (builtRef.current) {
        try { builtRef.current.reelSet.destroy(); } catch { /* ignore */ }
        builtRef.current = null;
      }
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

    if (builtRef.current) {
      try { builtRef.current.reelSet.destroy(); } catch { /* ignore */ }
      builtRef.current = null;
    }

    const outcome = compileAndBuild(src, env);
    if (!outcome.ok) {
      setStatus({ kind: 'err', msg: outcome.error });
      return;
    }
    const built = outcome.built;

    const PADDING = 24;
    const fitReel = () => {
      const rawW = built.reelSet.width / (built.reelSet.scale.x || 1);
      const rawH = built.reelSet.height / (built.reelSet.scale.y || 1);
      const availW = Math.max(40, env.app.screen.width - PADDING * 2);
      const availH = Math.max(40, env.app.screen.height - PADDING * 2);
      const scale = Math.min(1, availW / rawW, availH / rawH);
      built.reelSet.scale.set(scale);
      built.reelSet.x = (env.app.screen.width - rawW * scale) / 2;
      built.reelSet.y = (env.app.screen.height - rawH * scale) / 2;
    };
    env.app.stage.removeChildren();
    env.app.stage.addChild(built.reelSet);
    fitReel();
    const onResize = () => fitReel();
    env.app.renderer.on('resize', onResize);
    const origDestroy = built.reelSet.destroy.bind(built.reelSet);
    built.reelSet.destroy = function patched(...args: unknown[]) {
      try { env.app.renderer.off('resize', onResize); } catch { /* ignore */ }
      return origDestroy(...(args as []));
    };

    builtRef.current = built;

    try {
      const names = built.reelSet.speed.profileNames;
      if (!names.includes(speedName) && names[0]) {
        setSpeedName(names[0]);
        built.reelSet.setSpeed(names[0]);
      } else {
        built.reelSet.setSpeed(speedName);
      }
    } catch { /* ignore */ }

    setStatus({ kind: 'ok', msg: `Mounted. ${built.reelSet.reels.length} reel${built.reelSet.reels.length === 1 ? '' : 's'} × ${built.reelSet.reels[0]?.symbols.length ?? 0} slots (incl. buffers).` });
  }

  async function handleSpin() {
    const built = builtRef.current;
    if (!built) return;
    if (isSpinning) {
      if (built.cancel) built.cancel();
      else try { built.reelSet.skip(); } catch { /* ignore */ }
      return;
    }
    setIsSpinning(true);
    try {
      await runSpin(built);
    } catch (e) {
      setStatus({ kind: 'err', msg: `Spin error: ${(e as Error).message}` });
    } finally {
      setIsSpinning(false);
    }
  }

  function handleSpeedChange(name: string) {
    setSpeedName(name);
    const rs = builtRef.current?.reelSet;
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

  const speeds = builtRef.current?.reelSet.speed.profileNames ?? ['normal', 'turbo', 'superTurbo'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,480px)] gap-4">
      {/* Editor pane */}
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
            onClick={() => { setCode(pickInitialCode()); }}
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
            <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-green-600" />
          ) : null}
          <span className={cn_sandbox('font-mono leading-relaxed', status.kind === 'err' && 'text-destructive', status.kind === 'ok' && 'text-muted-foreground')}>
            {status.msg}
          </span>
        </div>
      </div>

      {/* Canvas pane */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2">
          <button
            type="button"
            onClick={() => void handleSpin()}
            disabled={isBooting || !builtRef.current}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
            title={isSpinning ? 'Slam stop' : 'Spin'}
          >
            {isSpinning ? 'Slam stop' : 'Spin'}
          </button>
          <div className="ml-1 inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/50 p-0.5">
            {speeds.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSpeedChange(s)}
                className={cn_sandbox(
                  'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  s === speedName
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">preview</span>
        </div>
        <div
          ref={canvasHostRef}
          className="relative min-h-[480px] flex-1 bg-card [&_canvas]:block"
        />
      </div>
    </div>
  );
}

/** Inlined tiny classnames helper so we don't import from @/lib/utils at module scope. */
function cn_sandbox(...a: Array<string | false | null | undefined>): string {
  return a.filter(Boolean).join(' ');
}
