/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { Play, Square, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  compileAndBuild,
  runSpin,
  ensurePrototypeAtlas,
  syncGsap,
  type BuildResult,
  type SandboxEnv,
} from './recipeExec.ts';
import { getRecipeCode } from './recipeRegistry.ts';

export interface RecipePreviewProps {
  slug: string;
  height?: number;
  autoRun?: boolean;
}

/**
 * Renders a compact PixiJS canvas driven by the recipe code registered
 * under `slug`. Same compile-and-run pipeline as /sandbox; the editor
 * is simply absent. A button bottom-right toggles run <-> slam-stop; a
 * pill bottom-left opens the same recipe in the sandbox.
 */
export default function RecipePreview(props: RecipePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const builtRef = useRef<BuildResult | null>(null);
  const appRef = useRef<Application | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      const code = getRecipeCode(props.slug);
      if (!code) {
        setError(`No recipe code registered for "${props.slug}".`);
        return;
      }

      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });
      if (disposed) { app.destroy(true, { children: true }); return; }
      syncGsap(app);

      host.innerHTML = '';
      host.appendChild(app.canvas);
      appRef.current = app;

      const atlas = await ensurePrototypeAtlas();
      if (disposed) { app.destroy(true, { children: true }); return; }

      const env: SandboxEnv = {
        app,
        textures: atlas.textures,
        blurTextures: atlas.blurTextures,
        SYMBOL_IDS: Object.keys(atlas.textures),
      };

      const outcome = compileAndBuild(code, env);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const built = outcome.built;
      builtRef.current = built;

      // Center + fit the reelSet into the canvas.
      const PADDING = 12;
      const fit = () => {
        const rawW = built.reelSet.width / (built.reelSet.scale.x || 1);
        const rawH = built.reelSet.height / (built.reelSet.scale.y || 1);
        const availW = Math.max(40, app.screen.width - PADDING * 2);
        const availH = Math.max(40, app.screen.height - PADDING * 2);
        const scale = Math.min(1, availW / rawW, availH / rawH);
        built.reelSet.scale.set(scale);
        built.reelSet.x = (app.screen.width - rawW * scale) / 2;
        built.reelSet.y = (app.screen.height - rawH * scale) / 2;
      };
      app.stage.addChild(built.reelSet);
      fit();
      app.renderer.on('resize', fit);

      if (props.autoRun !== false) void runOnce();
    })();

    return () => {
      disposed = true;
      try { builtRef.current?.reelSet.destroy(); } catch { /* ignore */ }
      builtRef.current = null;
      try { appRef.current?.destroy(true, { children: true }); } catch { /* ignore */ }
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug]);

  async function runOnce() {
    const built = builtRef.current;
    if (!built || running) return;
    setRunning(true);
    try {
      await runSpin(built);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('RecipePreview run failed:', e);
    } finally {
      setRunning(false);
    }
  }

  function onClick() {
    const built = builtRef.current;
    if (!built) return;
    if (running) {
      built.cancel?.();
    } else {
      void runOnce();
    }
  }

  const label = running ? 'Slam stop' : 'Run recipe';
  const canInterrupt = running && Boolean(builtRef.current?.cancel);
  const disabled = running && !canInterrupt;

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="relative flex w-full items-center justify-center bg-card"
        style={{ height: props.height ?? 320 }}
      >
        <div
          ref={hostRef}
          className="flex h-full w-full items-center justify-center [&_canvas]:block [&_canvas]:max-w-full [&_canvas]:h-auto"
        />
        {error && (
          <div className="absolute inset-4 flex items-center justify-center rounded-md bg-destructive/10 p-4 text-center text-xs text-destructive">
            {error}
          </div>
        )}
        <a
          href={`/sandbox/?recipe=${props.slug}`}
          title="Open in Sandbox"
          aria-label="Open in Sandbox"
          className={cn(
            'absolute bottom-3 left-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3',
            'border border-border/70 bg-background/80 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur',
            'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
          )}
        >
          <ExternalLink size={12} strokeWidth={2.5} />
          Open in Sandbox
        </a>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={label}
          aria-label={label}
          className={cn(
            'absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full',
            'border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur',
            'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
            'disabled:cursor-wait disabled:opacity-70',
          )}
        >
          {running ? (
            <Square size={14} strokeWidth={2.5} fill="currentColor" />
          ) : (
            <Play size={14} strokeWidth={2.5} fill="currentColor" />
          )}
        </button>
      </div>
    </div>
  );
}
