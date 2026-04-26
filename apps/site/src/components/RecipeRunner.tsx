/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Square } from 'lucide-react';
import { Application } from 'pixi.js';
import type { Texture } from 'pixi.js';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder, SpeedPresets, SpriteSymbol, AnimatedSpriteSymbol, DropRecipes, CascadeAnticipationPhase,
  enableDebug, WinPresenter,
  RectMaskStrategy, SharedRectMaskStrategy,
  type ReelSet, ReelSymbol,
} from 'pixi-reels';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';
import { loadPixellabSymbols } from '../../../../examples/shared/pixellabSymbolsLoader.ts';
import { transform as sucraseTransform } from 'sucrase';
import { runCascade, tumbleToGrid, diffCells } from '../../../../examples/shared/cascadeLoop.ts';
import { cn } from '@/lib/utils';

let gsapSynced = false;

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

class EmptySymbol extends ReelSymbol {
  protected onActivate(_symbolId: string): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(_w: number, _h: number): void {}
}

interface RunResult {
  reelSet?: ReelSet;
  nextResult?: () => string[][];
  onSpin?: () => Promise<void>;
  cleanup?: () => void;
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
  const cleanupRef = useRef<(() => void) | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
      if (cancelled) { app.destroy(true, { children: true }); return; }

      if (!gsapSynced) {
        gsapSynced = true;
        try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
        app.ticker.add((t) => gsap.updateRoot(t.lastTime / 1000));
      }

      host.innerHTML = '';
      host.appendChild(app.canvas);

      const { textures, blurTextures } = await loadPrototypeSymbols();
      if (cancelled) return;

      const SYMBOL_IDS = Object.keys(textures);
      const env: Env = { app, textures, blurTextures, SYMBOL_IDS };
      envRef.current = env;

      let js: string;
      try {
        js = sucraseTransform(code, { transforms: ['typescript'] }).code;
      } catch (e) {
        setError(`Compile error: ${(e as Error).message}`);
        return;
      }

      let result: RunResult;
      try {
        const factory = new AsyncFunction(
          'ReelSetBuilder', 'SpeedPresets', 'BlurSpriteSymbol', 'SpriteSymbol', 'AnimatedSpriteSymbol',
          'DropRecipes', 'CascadeAnticipationPhase',
          'WinPresenter', 'loadPixellabSymbols',
          'app', 'textures', 'blurTextures', 'SYMBOL_IDS', 'pickWeighted', 'gsap', 'PIXI',
          'runCascade', 'tumbleToGrid', 'diffCells', 'EmptySymbol', 'ReelSymbol',
          'RectMaskStrategy', 'SharedRectMaskStrategy',
          `"use strict"; ${js}`,
        );
        // Await the factory result so recipes that need async setup
        // (e.g. `await loadPixellabSymbols(...)`) can just `return await`
        // the built RunResult. Sync recipes that return a plain object
        // are unaffected — `await x` on a non-Promise resolves to x.
        result = (await factory(
          ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, SpriteSymbol, AnimatedSpriteSymbol,
          DropRecipes, CascadeAnticipationPhase,
          WinPresenter, loadPixellabSymbols,
          app, textures, blurTextures, SYMBOL_IDS, pickWeighted, gsap, PIXI,
          runCascade, tumbleToGrid, diffCells, EmptySymbol, ReelSymbol,
          RectMaskStrategy, SharedRectMaskStrategy,
        )) as RunResult;
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
      cleanupRef.current = result.cleanup ?? null;

      if (result.reelSet) {
        const rs = result.reelSet;
        const fit = () => {
          const rawW = rs.width / (rs.scale.x || 1);
          const rawH = rs.height / (rs.scale.y || 1);
          const pad = 16;
          const scale = Math.min(1, (app.screen.width - pad * 2) / rawW, (app.screen.height - pad * 2) / rawH);
          rs.scale.set(scale);
          rs.x = (app.screen.width - rawW * scale) / 2;
          rs.y = (app.screen.height - rawH * scale) / 2;
        };
        app.stage.addChild(rs);
        fit();
        app.renderer.on('resize', fit);
        enableDebug(rs);
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
      try { cleanupRef.current?.(); } catch { /* ignore */ }
      try { reelSetRef.current?.destroy(); } catch { /* ignore */ }
      try { envRef.current?.app.destroy(true, { children: true }); } catch { /* ignore */ }
      reelSetRef.current = null;
      onSpinRef.current = null;
      cleanupRef.current = null;
      envRef.current = null;
    };
  }, []);

  async function handleSpin() {
    if (!ready || !!error) return;
    if (spinning) {
      try { reelSetRef.current?.skip(); } catch { /* ignore */ }
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
        if (result) reelSet.setResult(result);
        await p;
      }
    } catch { /* ignore */ } finally {
      setSpinning(false);
    }
  }

  function openInSandbox() {
    window.location.href = `/sandbox/#code=${btoa(unescape(encodeURIComponent(code)))}`;
  }

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="relative flex w-full items-center justify-center bg-background"
        style={{ height }}
      >
        <div
          ref={hostRef}
          className="h-full w-full [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/90 p-6 font-mono text-xs text-destructive">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleSpin()}
          disabled={!!error || !ready}
          title={spinning ? 'Stop' : 'Spin'}
          aria-label={spinning ? 'Stop' : 'Spin'}
          className={cn(
            'absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full',
            'border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur',
            'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
            spinning && 'bg-primary text-primary-foreground border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {spinning
            ? <Square size={14} strokeWidth={2.5} />
            : <RefreshCw size={16} strokeWidth={2.25} />}
        </button>
        <button
          type="button"
          onClick={openInSandbox}
          title="Open in Sandbox"
          aria-label="Open in Sandbox"
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/70 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ExternalLink size={10} />
          Sandbox
        </button>
      </div>
    </div>
  );
}
