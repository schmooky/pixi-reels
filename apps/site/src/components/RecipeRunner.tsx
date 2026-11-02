/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ExternalLink, Bug, Volume2, VolumeX } from 'lucide-react';
import { Application } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { gsap } from 'gsap';
// DO NOT DELETE THESE TWO. Neither identifier is referenced in this file, so
// they read as dead imports -- but they are load-bearing. They force the spine
// runtime to be initialised eagerly, as one instance, before any recipe runs.
// Remove them and spine arrives only through the dynamic import table in
// lib/recipeModule, which races: /recipes/{cascade,hold-and-win,starters,symbols,
// wilds-and-pins}/ then die on mount with "Cannot read properties of undefined
// (reading 'validateRenderable')". Verified by bisect -- these two lines are
// the difference between 21/21 and 16/21 on recipes-mount.spec.ts.
//
// They cost ~176KB on pages that use no spine at all. Reclaiming that means
// fixing the ordering in the lazy path first, not deleting these.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SpineReelSymbol } from 'pixi-reels/spine';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { enableDebug, ReelSet } from 'pixi-reels';
import { CUE_STRIP } from '@pixi-reels/kit';
import type { RecipeResult } from '@pixi-reels/kit';
import { readyAudio, soundEnabled, setSoundEnabled, onSoundEnabled } from '../runtime/audio.ts';
import { runRecipeModule, OFF_STAGE } from '@/lib/recipeModule';
import { cn } from '@/lib/utils';
import { CanvasSkeleton } from './CanvasSkeleton';
import { useMinDisplay } from './useMinDisplay';

// Renderer teardown options for `app.destroy(...)`.
//
// MUST NOT be the bare `true` that reads so naturally here. In PixiJS v8
// `RendererDestroyOptions` is `TypeOrBool<ViewSystemDestroyOptions &
// { releaseGlobalResources?: boolean }>`, so `true` means removeView AND
// releaseGlobalResources -- and the resources it releases are PROCESS-global,
// not per-app: `AbstractRenderer.destroy` calls `GlobalResourceRegistry
// .release()`, which clears BigPool, TexturePool, CanvasPool and the batcher's
// module-level `batchPool`, calling `destroy()` on every pooled object.
//
// A recipe page mounts several Application instances at once (see
// LazyRecipeRunner). Pooled `Batch` / `BatchableSprite` objects handed out to
// the OTHER live apps are still referenced by their built instruction sets, so
// nuking the shared pools when one demo scrolls out of view left the survivors
// rendering freed objects on their very next frame:
//   TypeError: Cannot read properties of null (reading 'geometry')  // batch.batcher
//   TypeError: Cannot read properties of null (reading 'clear')     // batch.textures
// with a stack that is entirely Pixi internals (Ticker._tick -> ... ->
// BatcherPipe.execute), which is what makes it read like a render-loop bug
// rather than a teardown one.
//
// `{ removeView: true }` is the same view teardown minus the global-pool
// release: ViewSystem.destroy only ever reads `removeView`.
const DESTROY_RENDERER = { removeView: true } as const;

// GSAP is driven off a live PIXI app.ticker so tweens honor hidden-tab
// throttling (the documented "GSAP freezes in hidden tabs" gotcha). Several
// recipe canvases can be mounted at once, so we keep exactly ONE driver bound
// to a live app and promote a survivor when that app unmounts. A one-shot
// module flag (the previous shape) left gsap.updateRoot orphaned on a
// destroyed ticker the moment the first app went away, freezing every later
// recipe under client-side nav / React StrictMode / HMR.
const liveApps = new Set<Application>();
let gsapDriver: Application | null = null;
let gsapTickerFn: ((ticker: Ticker) => void) | null = null;

function ensureGsapDriver(): void {
  if (gsapDriver && liveApps.has(gsapDriver)) return; // current driver still alive
  // Detach gsap from its own internal ticker; we drive updateRoot ourselves.
  try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
  const next: Application | null = liveApps.values().next().value ?? null;
  gsapDriver = next;
  if (next) {
    gsapTickerFn = (ticker) => gsap.updateRoot(ticker.lastTime / 1000);
    next.ticker.add(gsapTickerFn);
  } else {
    gsapTickerFn = null;
  }
}

function releaseGsapApp(app: Application): void {
  liveApps.delete(app);
  if (gsapDriver === app) {
    if (gsapTickerFn) { try { app.ticker.remove(gsapTickerFn); } catch { /* ignore */ } }
    gsapDriver = null;
    gsapTickerFn = null;
    ensureGsapDriver(); // hand the driver to another live app, if one remains
  }
}

/** One toolbar voice: mono, 11px, uppercase; the primary action is the brand fill. */
const TOOL_BUTTON =
  'inline-flex h-6 items-center gap-1.5 rounded-sm border px-2.5 font-mono text-[11px] uppercase tracking-[0.14em] '
  + 'transition-[color,background-color,border-color,transform] duration-[133ms] active:scale-[0.97] '
  + 'disabled:cursor-not-allowed disabled:opacity-50';

/**
 * What a recipe returns. `stage` is a composition root the runner fits
 * instead of `reelSet`. See `RecipeResult` in `@pixi-reels/kit`.
 */
type RunResult = RecipeResult;

interface Env {
  app: Application;
}

interface RecipeRunnerProps {
  code: string;
  height?: number;
}

export function RecipeRunner({ code, height = 300 }: RecipeRunnerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<Env | null>(null);
  const reelSetRef = useRef<ReelSet | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  // The remembered choice, read after mount so the server and first client
  // render agree; every runner on the page follows one toggle.
  useEffect(() => {
    setSoundOn(soundEnabled());
    return onSoundEnabled(setSoundOn);
  }, []);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  // Hold the skeleton for at least 250ms so it doesn't flash for one
  // frame on fast loads.
  const showSkeleton = useMinDisplay(!ready, 250);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });
      if (cancelled) { app.destroy(DESTROY_RENDERER, { children: true }); return; }

      host.innerHTML = '';
      host.appendChild(app.canvas);

      const env: Env = { app };
      envRef.current = env;

      // Register only once the app is fully established (past every cancel
      // bail-out), so add/release stays symmetric with the cleanup below.
      liveApps.add(app);
      ensureGsapDriver();

      let result: RunResult;
      try {
        // The recipe is a module: its imports resolve through the one table
        // in lib/recipeModule.ts, the same for Studio and the share viewer.
        result = await runRecipeModule(code, { app });
      } catch (e) {
        setError(`Runtime error: ${(e as Error).message}`);
        return;
      }
      if (cancelled) return;

      // The recipe owns its round, its control and its sounds; the runner
      // reads only what the chrome needs: the set for the overlay and the
      // panel, the root to fit, the board to record, the cleanup to run.
      result ??= {};
      reelSetRef.current = result.reelSet ?? null;
      cleanupRef.current = result.cleanup ?? null;

      if (result.reelSet) {
        const rs = result.reelSet;
        // Fit the composition root when there is one, so a banner set moves,
        // scales and centres with the grid it sits above.
        const fitted = result.stage ?? rs;
        if (!fitted.parent) {
          setError(OFF_STAGE);
          return;
        }
        // Fit the local bounds, offset included: the debug overlay draws the
        // buffers and feed markers above the mask and its panels under it, so
        // the content does not start at (0, 0) once it is on.
        const fit = () => {
          const b = fitted.getLocalBounds();
          if (!(b.width > 0) || !(b.height > 0)) return;
          // The strip under the reels belongs to the recipe's tap cue.
          const pad = 16;
          const freeH = app.screen.height - CUE_STRIP - pad;
          const scale = Math.min(1, (app.screen.width - pad * 2) / b.width, (freeH - pad) / b.height);
          fitted.scale.set(scale);
          fitted.x = (app.screen.width - b.width * scale) / 2 - b.x * scale;
          fitted.y = pad + (freeH - pad - b.height * scale) / 2 - b.y * scale;
        };
        fit();
        fitRef.current = fit;
        app.renderer.on('resize', fit);
        enableDebug(rs);
        // The events panel docks beside the canvas and takes width from it;
        // PixiJS only watches the window, so the host's own resize is ours.
        const ro = new ResizeObserver(() => app.resize());
        ro.observe(host);
        unsubscribeRef.current.push(() => ro.disconnect());
      } else {
        // Board / custom-stage recipes (HoldAndWinBoard, BoardGrid) add their
        // own content (the grid, HUD, side panels, flight layer) straight to
        // app.stage at fixed pixel sizes and never scale it, so a composition
        // wider than the canvas clips left/right. Scale + center the whole
        // stage to fit: the board-of-reels equivalent of the reelSet fit above.
        // Bounds come from real measurable children (cell chrome, sprites, HUD,
        // panels), all created synchronously before the recipe returns. Mask
        // graphics don't count (Pixi marks masks measurable:false), which is why
        // an empty-on-load grid must carry chrome to be sized - board-grid-reveal
        // does. Late flights/labels land inside this extent, so a setup-time fit
        // (re-run on resize) holds for the whole run.
        const fitStage = () => {
          app.stage.scale.set(1);
          app.stage.position.set(0, 0);
          const b = app.stage.getLocalBounds();
          if (!(b.width > 0) || !(b.height > 0)) return;
          const pad = 16;
          const freeH = app.screen.height - CUE_STRIP - pad;
          const scale = Math.min(
            1,
            (app.screen.width - pad * 2) / b.width,
            (freeH - pad) / b.height,
          );
          app.stage.scale.set(scale);
          app.stage.position.set(
            (app.screen.width - b.width * scale) / 2 - b.x * scale,
            pad + (freeH - pad - b.height * scale) / 2 - b.y * scale,
          );
        };
        fitStage();
        app.renderer.on('resize', fitStage);
        const ro = new ResizeObserver(() => app.resize());
        ro.observe(host);
        unsubscribeRef.current.push(() => ro.disconnect());
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
      for (const off of unsubscribeRef.current) {
        try { off(); } catch { /* ignore */ }
      }
      unsubscribeRef.current = [];
      try { cleanupRef.current?.(); } catch { /* ignore */ }
      fitRef.current = null;
      try { reelSetRef.current?.destroy(); } catch { /* ignore */ }
      const app = envRef.current?.app;
      if (app) {
        releaseGsapApp(app); // hand off the gsap driver before the ticker dies
        try { app.destroy(DESTROY_RENDERER, { children: true }); } catch { /* ignore */ }
      }
      reelSetRef.current = null;
      cleanupRef.current = null;
      envRef.current = null;
    };
  }, []);

  // Studio is where a demo is read and debugged at full size: the code
  // beside the canvas, the overlay and the events panel beside both. The
  // docs page only hands the module over.
  function openInStudio(debug = false) {
    const hash = `#code=${btoa(unescape(encodeURIComponent(code)))}${debug ? '&debug=1' : ''}`;
    window.location.href = `/studio/${hash}`;
  }

  return (
    // Outer card frame + my-5 margin are supplied by the surrounding
    // <RecipeFrame> Astro wrapper so the layout is stable before JS
    // hydrates. Don't add a duplicate card here. The well keeps `height`;
    // the toolbar under it is the strip RecipeFrame's skeleton reserves.
    <div className="flex w-full flex-col bg-background" style={{ '--recipe-h': `${height}px` } as CSSProperties}>
    <div className="flex w-full">
    {/*
      The recipe owns the canvas: its `tapToSpin` turns a tap into a round
      and draws the cue. `data-state` is for the e2e suite, which taps the
      canvas once the recipe is ready.
    */}
    <div
      data-state={error ? 'error' : ready ? 'ready' : 'loading'}
      className="relative flex min-w-0 flex-1 cursor-pointer select-none items-center justify-center bg-[#111114]"
      style={{ height }}
    >
        <div
          ref={hostRef}
          className="h-full w-full [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
        />
        {showSkeleton && !error && <CanvasSkeleton label="Compiling recipe…" />}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/90 p-6 font-mono text-xs text-destructive">
            {error}
          </div>
        )}
    </div>
    </div>
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 border-t border-border px-1.5 py-1.5">
        <button
          type="button"
          onClick={() => openInStudio(true)}
          disabled={!!error || !ready}
          title="Open this demo in Studio with the overlay and the events panel"
          aria-label="Debug in Studio"
          className={cn(TOOL_BUTTON, 'border-border text-muted-foreground hover:border-foreground/60 hover:text-foreground')}
        >
          <Bug size={11} strokeWidth={2.25} />
          Debug
        </button>
        <button
          type="button"
          onClick={() => { setSoundEnabled(!soundOn); if (!soundOn) void readyAudio().catch(() => {}); }}
          title={soundOn ? 'Mute the demos' : 'Unmute the demos'}
          aria-label={soundOn ? 'Mute' : 'Unmute'}
          aria-pressed={soundOn}
          className={cn(
            TOOL_BUTTON,
            'ml-auto',
            soundOn
              ? 'border-border text-foreground hover:border-foreground/60'
              : 'border-border text-muted-foreground hover:border-foreground/60 hover:text-foreground',
          )}
        >
          {soundOn ? <Volume2 size={11} strokeWidth={2.25} /> : <VolumeX size={11} strokeWidth={2.25} />}
          Sound
        </button>
        <button
          type="button"
          onClick={() => openInStudio()}
          title="Open in Studio"
          aria-label="Open in Studio"
          className={cn(TOOL_BUTTON, 'border-border text-muted-foreground hover:border-foreground/60 hover:text-foreground')}
        >
          <ExternalLink size={11} strokeWidth={2.25} />
          Studio
        </button>
    </div>
    </div>
  );
}
