import { Application, Graphics } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, enableDebug } from 'pixi-reels';
import type { ReelSet, TumbleConfig } from 'pixi-reels';
import { gsap } from 'gsap';
import { BlockSymbol } from './BlockSymbol.ts';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';

let gsapSynced = false;
function syncGsap(app: Application): void {
  if (gsapSynced) return;
  gsapSynced = true;
  try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
  app.ticker.add((ticker) => { gsap.updateRoot(ticker.lastTime / 1000); });
}

export interface MiniConfig {
  reelCount: number;
  visibleRows: number;
  symbolSize?: { width: number; height: number };
  /**
   * Two shapes:
   *   - array of `{ id, color, glyph? }` — BlockSymbol (abstract teaching).
   *   - `{ kind: 'sprite', ids: [...] }` — BlurSpriteSymbol with the
   *     prototype atlas (real slot art). Ids must be atlas frame names.
   */
  symbols:
    | Array<{ id: string; color: number; glyph?: string }>
    | { kind: 'sprite'; ids: string[]; blurOnSpin?: boolean };
  weights?: Record<string, number>;
  /**
   * Opt-in tumble cascade phases — needed for any recipe that calls
   * `reelSet.refill(...)` or `reelSet.runCascade(...)`. Pass `true` for
   * library defaults, or a `TumbleConfig` to customise fall / dropIn.
   *
   * NOTE: enabling this flips the builder's default spin mode to
   * `'cascade'`. Recipes that combine a strip-spin first round with
   * a cascade chain should pass `spin({ mode: 'standard' })` for the
   * initial spin.
   */
  tumble?: true | TumbleConfig;
}

export interface MiniHandle {
  app: Application;
  reelSet: ReelSet;
  destroy: () => void;
}

/**
 * Boot a compact PixiJS reel set into `host` for a recipe micro-demo.
 * No cheat panel, no SPIN/Skip/Turbo chrome — the caller drives it directly.
 */
export async function mountMiniReels(
  host: HTMLDivElement,
  cfg: MiniConfig,
): Promise<MiniHandle> {
  const size = cfg.symbolSize ?? { width: 72, height: 72 };
  const padX = 10, padY = 10, gap = 4;
  // Width adapts to host on mobile / responsive layouts. Height is reel-
  // geometry-bound and never changes — the host's column is laid out around
  // the reels, not the other way around.
  const intrinsicWidth = cfg.reelCount * (size.width + gap) - gap + padX * 2 + 40;
  const computeWidth = (): number => Math.min(host.clientWidth || intrinsicWidth, intrinsicWidth);
  let width = computeWidth();
  const height = cfg.visibleRows * (size.height + gap) - gap + padY * 2 + 40;

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

  const isSprite = !Array.isArray(cfg.symbols) && cfg.symbols.kind === 'sprite';
  const spriteCfg = isSprite
    ? (cfg.symbols as { kind: 'sprite'; ids: string[]; blurOnSpin?: boolean })
    : null;
  const blockDefs = Array.isArray(cfg.symbols) ? cfg.symbols : [];
  const allIds: string[] = spriteCfg ? spriteCfg.ids : blockDefs.map((s) => s.id);

  let spriteTextures: { base: Record<string, import('pixi.js').Texture>; blur: Record<string, import('pixi.js').Texture> } | null = null;
  if (spriteCfg) {
    const atlas = await loadPrototypeSymbols();
    const base: Record<string, import('pixi.js').Texture> = {};
    const blur: Record<string, import('pixi.js').Texture> = {};
    for (const id of spriteCfg.ids) {
      const t = atlas.textures[id];
      if (!t) throw new Error(`prototype atlas missing frame "${id}"`);
      base[id] = t;
      if (atlas.blurTextures[id]) blur[id] = atlas.blurTextures[id];
    }
    spriteTextures = { base, blur };
  }

  const colors: Record<string, number> = {};
  const glyphs: Record<string, string> = {};
  for (const s of blockDefs) {
    colors[s.id] = s.color;
    if (s.glyph) glyphs[s.id] = s.glyph;
  }

  const builder = new ReelSetBuilder()
    .reels(cfg.reelCount)
    .visibleSymbols(cfg.visibleRows)
    .symbolSize(size.width, size.height)
    .symbolGap(gap, gap)
    .symbols((r) => {
      if (spriteCfg && spriteTextures) {
        for (const id of spriteCfg.ids) {
          r.register(id, BlurSpriteSymbol, {
            textures: spriteTextures.base,
            blurTextures: spriteTextures.blur,
            anchor: { x: 0.5, y: 0.5 },
            fit: true,
          });
        }
      } else {
        for (const s of blockDefs) {
          r.register(s.id, BlockSymbol, { colors, glyphs, radius: 12 });
        }
      }
    })
    .weights(cfg.weights ?? {})
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker);

  if (cfg.tumble) {
    builder.tumble(cfg.tumble === true ? undefined : cfg.tumble);
  }

  const reelSet = builder.build();

  // Blur-on-spin wiring (sprite mode only, on by default).
  if (spriteCfg && (spriteCfg.blurOnSpin ?? true)) {
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
      reel.events.on('phase:enter', (name) => {
        if (name === 'spin') { blurring[r] = true; setReelBlur(r, true); }
        else if (name === 'stop') { blurring[r] = false; setReelBlur(r, false); }
      });
      reel.events.on('symbol:created', () => {
        if (blurring[r]) setReelBlur(r, true);
      });
    }
    reelSet.events.on('skip:requested', () => {
      for (let r = 0; r < cfg.reelCount; r++) {
        blurring[r] = false;
        setReelBlur(r, false);
      }
    });
  }
  // allIds retained for callers via the returned `handle` — not exposed today
  // but useful if a future recipe wants to enumerate the registered set.
  void allIds;

  const frame = new Graphics();
  const totalW = cfg.reelCount * (size.width + gap) - gap + padX * 2;
  const totalH = cfg.visibleRows * (size.height + gap) - gap + padY * 2;
  frame.roundRect(0, 0, totalW, totalH, 14)
    .fill({ color: 0xffffff, alpha: 1 })
    .roundRect(0, 0, totalW, totalH, 14)
    .stroke({ color: 0xe5dccf, width: 1, alpha: 0.9 });
  app.stage.addChild(frame);
  app.stage.addChild(reelSet);

  // Recompute width-dependent positions AND scale the reels to fit. Called
  // once at boot then whenever the wrapping column changes size (mobile
  // rotate, responsive breakpoints inside a multi-canvas recipe page). If
  // host width drops below the intrinsic reel width we scale the whole
  // group down uniformly — same `fit()` pattern as RecipeRunner.
  const relayout = (): void => {
    width = computeWidth();
    app.renderer.resize(width, height);
    const scale = Math.min(1, width / totalW, height / totalH);
    const scaledW = totalW * scale;
    const scaledH = totalH * scale;
    frame.scale.set(scale);
    frame.x = (width - scaledW) / 2;
    frame.y = (height - scaledH) / 2;
    reelSet.scale.set(scale);
    reelSet.x = frame.x + padX * scale;
    reelSet.y = frame.y + padY * scale;
  };
  relayout();
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => relayout())
    : null;
  resizeObserver?.observe(host);

  enableDebug(reelSet);

  return {
    app,
    reelSet,
    destroy() {
      try { resizeObserver?.disconnect(); } catch (err) { console.warn('miniRuntime: observer disconnect failed', err); }
      try { reelSet.destroy(); } catch (err) { console.warn('miniRuntime: reelSet destroy failed', err); }
      try { app.destroy(true, { children: true }); } catch (err) { console.warn('miniRuntime: app destroy failed', err); }
    },
  };
}

// ── Little animation primitives recipe components share ────────────────────

export async function fadeOutCells(
  reelSet: ReelSet,
  cells: Array<{ reel: number; row: number }>,
  durationMs = 320,
): Promise<void> {
  if (cells.length === 0) return;

  // The ReelSymbol `view` container is positioned at the top-left of its
  // cell, so scaling it naively shrinks the symbol into the corner. Bind
  // each view's pivot to the cell's visual center for the animation so the
  // fade-and-shrink reads as "vanish from the middle".
  interface Pinned {
    view: { alpha: number; scale: { set: (s: number) => void }; pivot: { x: number; y: number; set: (x: number, y: number) => void }; x: number; y: number };
    origPivotX: number;
    origPivotY: number;
    origX: number;
    origY: number;
  }
  const pinned: Pinned[] = [];
  for (const c of cells) {
    const reel = reelSet.getReel(c.reel);
    const view = reel.getSymbolAt(c.row).view;
    // Infer cell size from the reel's grid geometry: two rows' y difference
    // gives the slot pitch; symbol's own local bounds give the render width.
    const cellH = reel.getSymbolAt(Math.min(1, reel.getVisibleSymbols().length - 1)).view.y
      - reel.getSymbolAt(0).view.y || 0;
    const cellW = cellH; // mini demos always use square cells
    const h = Math.abs(cellH) || 72;
    const w = cellW || 72;
    const origPivotX = view.pivot.x;
    const origPivotY = view.pivot.y;
    const origX = view.x;
    const origY = view.y;
    view.pivot.set(w / 2, h / 2);
    view.x = origX + (w / 2 - origPivotX);
    view.y = origY + (h / 2 - origPivotY);
    pinned.push({ view, origPivotX, origPivotY, origX, origY });
  }

  const start = performance.now();
  await new Promise<void>((resolve) => {
    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      for (const p of pinned) {
        p.view.alpha = 1 - t;
        p.view.scale.set(1 - 0.6 * t);
      }
      if (t >= 1) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // Restore pivot/position. Alpha stays 0 — identity gets swapped by the
  // caller's next placeSymbols. Scale stays at its end value for the same
  // reason; _replaceSymbol resets both on the new activation.
  for (const p of pinned) {
    p.view.pivot.set(p.origPivotX, p.origPivotY);
    p.view.x = p.origX;
    p.view.y = p.origY;
  }
}

export async function spinToGrid(reelSet: ReelSet, grid: string[][], delay = 200): Promise<void> {
  const promise = reelSet.spin();
  await new Promise((r) => setTimeout(r, delay));
  reelSet.setResult(grid.map((visible) => ({ visible })));
  await promise;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
