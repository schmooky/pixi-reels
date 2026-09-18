/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { RefreshCw, ExternalLink, SkipForward, Bug } from 'lucide-react';
import { Application } from 'pixi.js';
import type { Texture, Ticker } from 'pixi.js';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
// DO NOT DELETE THESE TWO. Neither identifier is referenced in this file, so
// they read as dead imports -- but they are load-bearing. They force the spine
// runtime to be initialised eagerly, as one instance, before any recipe runs.
// Remove them and spine arrives only through the dynamic LAZY_GROUPS path in
// recipeGlobals, which races: /recipes/{cascade,hold-and-win,starters,symbols,
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
import {
  ReelSetBuilder, SpeedPresets, SpriteSymbol, AnimatedSpriteSymbol,
  enableDebug, WinPresenter,
  RectMaskStrategy, SharedRectMaskStrategy,
  ReelSet, ReelSymbol,
  EmptySymbol, HoldAndWinBuilder, BoardGrid,
  anticipationForScatters,
  SpinTextureCache, StaticSpinSymbol, prewarmSpinTextures,
  debugOverlay, type DebugOverlayHandle,
} from 'pixi-reels';
import { BlurSpriteSymbol } from '../runtime/BlurSpriteSymbol.ts';
import { CardSymbol, CARD_DECK, WILD_CARD } from 'pixi-reels';
import {
  CoinSymbol,
  COIN_TIER,
  COIN_FEATURE,
  COIN_MYSTERY,
  COIN_TRIGGER,
  coinValue,
  coinMultiplier,
  drawCoin,
} from '../runtime/CoinSymbol.ts';
import {
  GoldCoinSymbol,
  coinWaves,
  bezierFly,
  settleMoneyFace,
  freezeAtEnd,
  fitText,
} from '../runtime/holdAndWinFx.ts';
import { loadPrototypeSymbols } from '../runtime/prototypeSpriteLoader.ts';
import {
  loadGeneratedSpines,
  buildSpineMap,
} from '../runtime/generatedSpineLoader.ts';
import {
  loadThunderkickSpines,
  buildThunderkickSpineMap,
  THUNDERKICK_SYMBOL_IDS,
} from '../runtime/thunderkickSpineLoader.ts';
import {
  loadCascadeSpines,
  buildCascadeSpineMap,
  CASCADE_SYMBOL_IDS,
  CASCADE_PLATE_W,
  CASCADE_PLATE_H,
} from '../runtime/cascadeSpineLoader.ts';
import { loadHoldAndWinSprites } from '../runtime/holdAndWinSprites.ts';
import { transform as sucraseTransform } from 'sucrase';
import { runRecipeSource } from '@/lib/recipeGlobals';
import { cn } from '@/lib/utils';
import { CanvasSkeleton } from './CanvasSkeleton';
import { useMinDisplay } from './useMinDisplay';
import { EventsPanel, ROW_LIMIT } from './EventsPanel';
import type { EventEntry } from './EventsPanel';
import { onNotice } from 'pixi-reels';

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

// Use AsyncFunction so recipes can do top-level `await loadPixellabSymbols(...)`
// inside the injected body. Plain `new Function(...)` returns a sync function
// where top-level await is a SyntaxError.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;

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
 * Every `ReelSet` currently on the stage, `primary` first.
 *
 * A recipe returns at most ONE set (the rest it parents itself, usually under
 * a `stage` composition root), so a debug toggle driven off the returned one
 * left the banner strip in `banner-ways` and the second grid in
 * `symbols-transposed-pair` with no overlay at all. Walking the display tree
 * finds them whatever the recipe did with them, and needs no per-recipe
 * bookkeeping.
 */
function collectReelSets(stage: PIXI.Container, primary: ReelSet | null): ReelSet[] {
  const found: ReelSet[] = primary ? [primary] : [];
  const walk = (node: PIXI.Container): void => {
    if (node instanceof ReelSet) {
      if (!found.includes(node)) found.push(node);
      // Don't descend: a set's own children are reels and viewports, and a
      // ReelSet is never nested inside another one.
      return;
    }
    for (const child of node.children) walk(child as PIXI.Container);
  };
  walk(stage);
  return found;
}

interface RunResult {
  reelSet?: ReelSet;
  /**
   * A container holding a MULTI-SET composition (e.g. a horizontal banner
   * above a vertical grid). When present the runner scales and centres THIS,
   * not `reelSet`, so every set moves together.
   *
   * Without it a recipe that builds a second set has to `app.stage.addChild`
   * it itself, and the runner's fit then scales and centres only `reelSet` -
   * leaving the other set at unscaled stage coordinates, nowhere near where
   * the recipe put it. Lay the composition out from its own origin (top-left
   * at 0,0) so the fit's bounds math holds.
   */
  stage?: PIXI.Container;
  nextResult?: () => string[][];
  onSpin?: () => Promise<void>;
  /**
   * Optional override for the canvas button's "skip while running"
   * behaviour. Recipes that drive a nudge / cascade / custom timeline
   * can intercept the player's mid-action button press here. If absent,
   * the runner falls back to: nudge in flight → `skipNudge()`; otherwise
   * try `skip()` and fall through to `requestSkip()`.
   */
  onSkip?: () => void;
  /**
   * A board (HoldAndWinBoard) whose bus the events panel should hear beside
   * the reel sets it finds on the stage. Cells are reel sets and are found on
   * their own; this is for the board-level events (`feature:*`, `coin:*`).
   */
  board?: { events: AnyBus };
  cleanup?: () => void;
}

/** The two methods the events panel needs from any bus, typed loosely on purpose. */
interface AnyBus {
  onAny(fn: (event: string, ...args: unknown[]) => void): unknown;
  offAny(fn: (event: string, ...args: unknown[]) => void): unknown;
}

interface Env {
  app: Application;
  textures: Record<string, Texture>;
  blurTextures: Record<string, Texture>;
  SYMBOL_IDS: string[];
}

interface RecipeRunnerProps {
  code: string;
  height?: number;
}

export function RecipeRunner({ code, height = 300 }: RecipeRunnerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<Env | null>(null);
  const reelSetRef = useRef<ReelSet | null>(null);
  const nextResultRef = useRef<(() => string[][]) | null>(null);
  const onSpinRef = useRef<(() => Promise<void>) | null>(null);
  const onSkipRef = useRef<(() => void) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // One handle per reel set on the stage, not per recipe: a recipe is free to
  // build several (a banner strip above the grid, a transposed pair), and an
  // overlay on only the one it happened to return explains half the picture.
  const overlayRef = useRef<DebugOverlayHandle[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [debugOn, setDebugOn] = useState(false);
  // The overlay draws into a container on the ReelSet, so a recipe that
  // returns only `onSpin` (HoldAndWinBoard, BoardGrid) has nothing to draw on.
  const [canDebug, setCanDebug] = useState(false);
  // The events recorder. Always on (a push per event, capped), rendered only
  // while the panel is open: `eventsTick` bumps once per animation frame with
  // new rows, so a burst of `symbol:created` is one re-render, not a hundred.
  const eventsRef = useRef<EventEntry[]>([]);
  const eventsDirtyRef = useRef(false);
  const eventsFrameRef = useRef<number | null>(null);
  const spinOriginRef = useRef<number | null>(null);
  const eventIdRef = useRef(0);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const debugOnRef = useRef(false);
  const [eventsTick, setEventsTick] = useState(0);
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

      const { textures, blurTextures } = await loadPrototypeSymbols();
      if (cancelled) return;

      const SYMBOL_IDS = Object.keys(textures);
      const env: Env = { app, textures, blurTextures, SYMBOL_IDS };
      envRef.current = env;

      // Register only once the app is fully established (past every cancel
      // bail-out), so add/release stays symmetric with the cleanup below.
      liveApps.add(app);
      ensureGsapDriver();

      let js: string;
      try {
        js = sucraseTransform(code, { transforms: ['typescript'] }).code;
      } catch (e) {
        setError(`Compile error: ${(e as Error).message}`);
        return;
      }

      let result: RunResult;
      try {
        // One shared global surface for all three recipe runtimes. See
        // lib/recipeGlobals.ts for why the hand-written parameter lists went.
        result = await runRecipeSource<RunResult>(js, {
          app, textures, blurTextures, SYMBOL_IDS, pickWeighted,
          ReelSetBuilder,
        });
      } catch (e) {
        setError(`Runtime error: ${(e as Error).message}`);
        return;
      }

      if (!result?.reelSet && !result?.onSpin) {
        setError('Recipe must return { reelSet } or { onSpin }.');
        return;
      }

      reelSetRef.current = result.reelSet ?? null;
      nextResultRef.current = result.nextResult ?? null;
      onSpinRef.current = result.onSpin ?? null;
      onSkipRef.current = result.onSkip ?? null;
      cleanupRef.current = result.cleanup ?? null;

      // Record every bus in the demo for the events panel: each reel set on
      // the stage (a board's cells included), each of their reels, the board
      // itself when the recipe hands it over, and engine notices.
      const record = (source: string) => (event: string, ...args: unknown[]): void => {
        const now = performance.now();
        if (event === 'spin:start') {
          // A board starts its cells within the same burst: keep one origin.
          const prev = spinOriginRef.current;
          if (prev === null || now - prev > 100) spinOriginRef.current = now;
        }
        const origin = spinOriginRef.current;
        const list = eventsRef.current;
        list.push({ id: ++eventIdRef.current, t: now, rel: origin === null ? null : now - origin, source, name: event, args });
        if (list.length > ROW_LIMIT) list.splice(0, list.length - ROW_LIMIT);
        eventsDirtyRef.current = true;
        if (debugOnRef.current && eventsFrameRef.current === null) {
          eventsFrameRef.current = requestAnimationFrame(() => {
            eventsFrameRef.current = null;
            if (!eventsDirtyRef.current) return;
            eventsDirtyRef.current = false;
            setEventsTick((n) => n + 1);
          });
        }
      };
      const listen = (bus: AnyBus, source: string): void => {
        const fn = record(source);
        bus.onAny(fn);
        unsubscribeRef.current.push(() => bus.offAny(fn));
      };
      const sets = collectReelSets(app.stage, result.reelSet ?? null);
      sets.forEach((rs, k) => {
        const setLabel = sets.length === 1 ? 'set' : `set${k}`;
        listen(rs.events as unknown as AnyBus, setLabel);
        rs.reels.forEach((reel, i) => listen(reel.events as unknown as AnyBus, sets.length === 1 ? `reel ${i}` : `${setLabel}/r${i}`));
      });
      if (result.board?.events) listen(result.board.events, 'board');
      unsubscribeRef.current.push(onNotice((n) => record('notice')(n.code, { kind: n.kind, message: n.message, detail: n.detail })));

      if (result.reelSet) {
        const rs = result.reelSet;
        // Fit the composition root when there is one, so a banner set moves,
        // scales and centres with the grid it sits above.
        const fitted = result.stage ?? rs;
        const fit = () => {
          const rawW = fitted.width / (fitted.scale.x || 1);
          const rawH = fitted.height / (fitted.scale.y || 1);
          const pad = 16;
          const scale = Math.min(1, (app.screen.width - pad * 2) / rawW, (app.screen.height - pad * 2) / rawH);
          fitted.scale.set(scale);
          fitted.x = (app.screen.width - rawW * scale) / 2;
          fitted.y = (app.screen.height - rawH * scale) / 2;
        };
        app.stage.addChild(fitted);
        fit();
        app.renderer.on('resize', fit);
        enableDebug(rs);
        setCanDebug(true);
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
          const scale = Math.min(
            1,
            (app.screen.width - pad * 2) / b.width,
            (app.screen.height - pad * 2) / b.height,
          );
          app.stage.scale.set(scale);
          app.stage.position.set(
            (app.screen.width - b.width * scale) / 2 - b.x * scale,
            (app.screen.height - b.height * scale) / 2 - b.y * scale,
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
      if (eventsFrameRef.current !== null) cancelAnimationFrame(eventsFrameRef.current);
      try { cleanupRef.current?.(); } catch { /* ignore */ }
      // Before the set and the app: the overlay is a child of the ReelSet and
      // holds a TickerRef on app.ticker.
      for (const o of overlayRef.current) {
        try { o.destroy(); } catch { /* ignore */ }
      }
      overlayRef.current = [];
      try { reelSetRef.current?.destroy(); } catch { /* ignore */ }
      const app = envRef.current?.app;
      if (app) {
        releaseGsapApp(app); // hand off the gsap driver before the ticker dies
        try { app.destroy(DESTROY_RENDERER, { children: true }); } catch { /* ignore */ }
      }
      reelSetRef.current = null;
      onSpinRef.current = null;
      cleanupRef.current = null;
      envRef.current = null;
    };
  }, []);

  async function handleSpin() {
    if (!ready || !!error) return;
    if (spinning) {
      // Recipe-supplied skip handler wins. lets a nudge / cascade / custom
      // timeline recipe intercept the player's mid-action tap. Otherwise
      // fall through to the built-in heuristics.
      if (onSkipRef.current) {
        onSkipRef.current();
        return;
      }
      // Nudge in flight → skip THAT first (the spin pipeline is idle).
      const reelSet = reelSetRef.current;
      if (reelSet && reelSet.reels.some((r) => r.isNudging)) {
        reelSet.skipNudge();
        return;
      }
      // skipSpin() THROWS before setResult() arrives. Route to requestSkip()
      // in the catch so a player tap during the server-wait window still
      // queues the slam and fires it the moment the result is in.
      try { reelSetRef.current?.skipSpin(); }
      catch { reelSetRef.current?.requestSkip(); }
      return;
    }
    setSpinning(true);
    try {
      if (onSpinRef.current) {
        await onSpinRef.current();
      } else {
        const reelSet = reelSetRef.current;
        if (!reelSet) return;
        const p = reelSet.spin();
        await new Promise((r) => setTimeout(r, 150));
        const result = nextResultRef.current?.();
        if (result) reelSet.setResult(result.map((visible) => ({ visible })));
        await p;
      }
    } catch (err) {
      // Don't surface mid-spin transient errors in the UI (recipe runner
      // shouldn't flash error banners during normal cleanup races). DO
      // log them. silently swallowing here previously hid a real shape
      // bug where recipes passed `string[][]` to `refill({ grid })` and
      // the engine threw inside a Promise that no one was watching.
      // eslint-disable-next-line no-console -- diagnostic surface
      console.error('[RecipeRunner] handleSpin threw:', err);
    } finally {
      setSpinning(false);
    }
  }

  function toggleDebug() {
    if (debugOn) {
      for (const o of overlayRef.current) o.destroy();
      overlayRef.current = [];
      debugOnRef.current = false;
      setDebugOn(false);
      return;
    }
    debugOnRef.current = true;
    setDebugOn(true);
    setEventsTick((n) => n + 1);
    const reelSet = reelSetRef.current;
    const app = envRef.current?.app;
    if (!reelSet || !app) return;
    // Built on first press, not at mount: a umbrella page mounts several
    // recipes at once and none of them should pay for an overlay nobody asked
    // to see. `live` drives the bounds / blocks / pins / hud layers off the
    // recipe's own app.ticker, so they track a spin instead of freezing on the
    // frame the overlay happened to be built in.
    overlayRef.current = collectReelSets(app.stage, reelSet).map((rs) =>
      debugOverlay(rs, { layers: 'all', live: true, ticker: app.ticker }),
    );
  }

  function clearEvents() {
    eventsRef.current = [];
    setEventsTick((n) => n + 1);
  }

  function openInStudio() {
    window.location.href = `/studio/#code=${btoa(unescape(encodeURIComponent(code)))}`;
  }

  return (
    // Outer card frame + my-5 margin are supplied by the surrounding
    // <RecipeFrame> Astro wrapper so the layout is stable before JS
    // hydrates. Don't add a duplicate card here. With the events panel open
    // the canvas keeps its height and gives up width to the panel on the
    // right; below the `sm` breakpoint the panel goes under the canvas.
    <div className={cn('flex w-full bg-background', debugOn && 'flex-col sm:flex-row')} style={{ '--recipe-h': `${height}px` } as CSSProperties}>
    <div
      className="relative flex min-w-0 flex-1 items-center justify-center"
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
        <button
          type="button"
          onClick={() => void handleSpin()}
          disabled={!!error || !ready}
          title={spinning ? 'Skip' : 'Spin'}
          aria-label={spinning ? 'Skip' : 'Spin'}
          className={cn(
            // Right edge, vertically centered. Bigger touch target than
            // the corner bottom-right pill. easier to hit on mobile, more
            // obvious as the primary action on the canvas.
            'absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-14 w-14 items-center justify-center rounded-full',
            'border border-border/70 bg-background/80 text-foreground shadow-md backdrop-blur',
            'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
            spinning && 'bg-primary text-primary-foreground border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {spinning
            ? <SkipForward size={22} strokeWidth={2.25} />
            : <RefreshCw size={22} strokeWidth={2.25} />}
        </button>
        {(
          <button
            type="button"
            onClick={toggleDebug}
            disabled={!!error || !ready}
            title={debugOn ? 'Hide the events panel and overlay' : canDebug ? 'Show the events panel and overlay' : 'Show the events panel'}
            aria-label={debugOn ? 'Hide debug' : 'Show debug'}
            aria-pressed={debugOn}
            className={cn(
              'absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border px-2 py-1',
              'text-[10px] backdrop-blur transition-colors',
              debugOn
                ? 'border-primary bg-primary/90 text-primary-foreground'
                : 'border-border/40 bg-background/70 text-muted-foreground hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Bug size={10} />
            Debug
          </button>
        )}
        <button
          type="button"
          onClick={openInStudio}
          title="Open in Studio"
          aria-label="Open in Studio"
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/70 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ExternalLink size={10} />
          Studio
        </button>
    </div>
    {debugOn && (
      <EventsPanel
        entries={eventsRef.current}
        tick={eventsTick}
        onClear={clearEvents}
        className="h-[220px] w-full shrink-0 border-t sm:h-[var(--recipe-h)] sm:w-[360px] sm:max-w-[46%] sm:border-l sm:border-t-0"
      />
    )}
    </div>
  );
}
