/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  SpinTextureCache,
  StaticSpinSymbol,
  anticipationForScatters,
  prewarmSpinTextures,
  type ColumnTarget,
  type ReelSet,
  type SymbolPosition,
} from 'pixi-reels';
import { StickerSymbol, loadGenericSymbols, presentWithSpotlight } from '@pixi-reels/kit';

/**
 * Live reels for the landing page.
 *
 * Four variants, one component. Every variant is a real `ReelSet` built with
 * the public builder and the generic sticker set, so what the visitor sees
 * spinning is the engine itself, not a video. The loop auto-spins while the
 * canvas is on screen and idles when it scrolls away or the tab hides. It
 * takes no input: the landing shows the engine, the recipes are where a
 * visitor drives one.
 *
 * It spins under `prefers-reduced-motion` too. Windows reports that preference
 * whenever "Animation effects" is off, which many machines ship or are set to,
 * and a hero that never moves reads as broken. The motion stays inside its
 * box: no parallax, no full-screen movement.
 */
export type LandingVariant = 'hero' | 'cascade' | 'horizontal' | 'anticipation';

interface Props {
  variant: LandingVariant;
  className?: string;
}

interface VariantConfig {
  reels: number;
  cells: number;
  cell: number;
  gap: number;
  pad: number;
  orientation: 'vertical' | 'horizontal';
  ids: string[];
  /** Symbol id that triggers anticipation (anticipation variant only). */
  scatter?: string;
  tumble?: boolean;
  speed: typeof SpeedPresets.NORMAL;
}

// The generic set's highs (seven, diamond, bell, clover) and royals.
const HIGHS = ['H1', 'H2', 'H3', 'H4'];
const ROYALS = ['L5', 'L4', 'L3', 'L2', 'L1'];

const VARIANTS: Record<LandingVariant, VariantConfig> = {
  hero: {
    reels: 5, cells: 3, cell: 104, gap: 8, pad: 16,
    orientation: 'vertical',
    ids: [...HIGHS, 'L5', 'L4', 'W'],
    speed: SpeedPresets.NORMAL,
  },
  cascade: {
    reels: 5, cells: 4, cell: 58, gap: 5, pad: 12,
    orientation: 'vertical',
    ids: [...HIGHS.slice(1), ...ROYALS.slice(0, 3)],
    tumble: true,
    speed: { ...SpeedPresets.NORMAL, stopDelay: 120 },
  },
  horizontal: {
    reels: 3, cells: 5, cell: 58, gap: 5, pad: 12,
    orientation: 'horizontal',
    ids: ROYALS,
    speed: SpeedPresets.NORMAL,
  },
  anticipation: {
    reels: 5, cells: 3, cell: 58, gap: 5, pad: 12,
    orientation: 'vertical',
    ids: [...HIGHS.slice(0, 3), 'L5', 'S'],
    scatter: 'S',
    speed: SpeedPresets.NORMAL,
  },
};

// The host element paints the dark well (`.hero-well` / `.mech-well`) and owns
// its corners; the canvas is transparent and draws only the thin dividers
// between neighbouring reels. No frame inside a frame, no box per cell: the
// symbols are the only thing with an edge.

// Renderer teardown: `{ removeView: true }` and never the bare `true`, which
// would also release pixi's process-global pools out from under the other live
// canvases on the page (see RecipeRunner.tsx for the full story).
const DESTROY_RENDERER = { removeView: true } as const;

// One gsap driver for the whole page. Several canvases mount at once; exactly
// one of them drives `gsap.updateRoot` off its ticker, and a survivor takes
// over when that one unmounts.
const liveApps = new Set<Application>();
let driverApp: Application | null = null;
let driverFn: ((t: Ticker) => void) | null = null;
function ensureGsapDriver(): void {
  if (driverApp && liveApps.has(driverApp)) return;
  if (driverApp && driverFn) { try { driverApp.ticker.remove(driverFn); } catch { /* gone */ } }
  driverApp = null; driverFn = null;
  const next = liveApps.values().next().value as Application | undefined;
  if (!next) { gsap.ticker.add(gsap.updateRoot); return; }
  gsap.ticker.remove(gsap.updateRoot);
  driverFn = (t) => { gsap.updateRoot(t.lastTime / 1000); };
  next.ticker.add(driverFn);
  driverApp = next;
}

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms: number, signal: { kicked: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (signal.kicked || performance.now() - t0 >= ms) resolve();
      else setTimeout(tick, 60);
    };
    tick();
  });
}

interface Mounted {
  app: Application;
  reelSet: ReelSet;
  destroy: () => void;
}

async function mount(host: HTMLDivElement, cfg: VariantConfig): Promise<Mounted> {
  const { textures } = await loadGenericSymbols();

  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resizeTo: host,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  host.replaceChildren(app.canvas);
  app.canvas.style.display = 'block';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  liveApps.add(app);
  ensureGsapDriver();

  // The reels spin a baked motion blur of each sticker (the library's
  // StaticSpinSymbol over a SpinTextureCache), baked up front.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const sticker = () => new StickerSymbol({ textures });
  prewarmSpinTextures({ cache, ids: cfg.ids, createSymbol: sticker, width: cfg.cell, height: cfg.cell });

  const builder = new ReelSetBuilder()
    .reels(cfg.reels)
    .visibleCells(cfg.cells)
    .symbolSize(cfg.cell, cfg.cell)
    .symbolGap(cfg.gap, cfg.gap)
    .orientation(cfg.orientation)
    .symbols((r) => {
      for (const id of cfg.ids) {
        // A tumble never spins, so its stickers need no blur.
        if (cfg.tumble) r.register(id, StickerSymbol, { textures });
        else r.register(id, StaticSpinSymbol, { createInner: sticker, cache, blurRampMs: 140 });
      }
    })
    .speed('normal', cfg.speed)
    .gsap(gsap)
    .ticker(app.ticker);
  if (cfg.tumble) {
    builder.tumble({
      fall: { duration: 283, ease: 'power3.in', cellStagger: 67 },
      dropIn: { duration: 450, ease: 'power2.in', cellStagger: 67, distance: 'perHole' },
    });
  }
  const reelSet = builder.build();

  // Geometry of the well around the set. Screen-space: on a horizontal set the
  // reels stack down the screen and cells run along x.
  const across = cfg.orientation === 'vertical' ? cfg.reels : cfg.cells;
  const down = cfg.orientation === 'vertical' ? cfg.cells : cfg.reels;
  const gridW = across * (cfg.cell + cfg.gap) - cfg.gap;
  const gridH = down * (cfg.cell + cfg.gap) - cfg.gap;
  const W = gridW + cfg.pad * 2;
  const H = gridH + cfg.pad * 2;

  const root = new Container();
  const well = new Graphics();
  // Dividers run along the travel axis between reels, fading out at both
  // ends, so the eye keeps the column without ever seeing a cell. A mid grey
  // reads on the light stage and the dark one, so a theme switch needs no
  // redraw.
  const vertical = cfg.orientation === 'vertical';
  const reelPitch = cfg.cell + cfg.gap;
  const dividerLen = (vertical ? gridH : gridW) * 0.88;
  const dividerStart = cfg.pad + (vertical ? gridH : gridW) * 0.06;
  const divider = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: vertical ? { x: 0, y: 1 } : { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: 'rgba(128,128,136,0)' },
      { offset: 0.5, color: 'rgba(128,128,136,0.5)' },
      { offset: 1, color: 'rgba(128,128,136,0)' },
    ],
    textureSpace: 'local',
  });
  for (let i = 1; i < cfg.reels; i++) {
    const at = cfg.pad + i * reelPitch - cfg.gap / 2 - 1;
    if (vertical) well.rect(at, dividerStart, 2, dividerLen).fill(divider);
    else well.rect(dividerStart, at, dividerLen, 2).fill(divider);
  }
  root.addChild(well);
  reelSet.x = cfg.pad;
  reelSet.y = cfg.pad;
  root.addChild(reelSet);
  app.stage.addChild(root);

  // The well stays put when a reel lands: the reels carry the bounce, the
  // frame around them does not shake.
  const fit = () => {
    const fitScale = Math.min(app.screen.width / W, app.screen.height / H);
    root.scale.set(fitScale);
    root.x = (app.screen.width - W * fitScale) / 2;
    root.y = (app.screen.height - H * fitScale) / 2;
  };
  fit();
  app.renderer.on('resize', fit);
  const ro = new ResizeObserver(() => app.resize());
  ro.observe(host);

  return {
    app,
    reelSet,
    destroy() {
      try { ro.disconnect(); } catch { /* ignore */ }
      try { app.renderer.off('resize', fit); } catch { /* ignore */ }
      try { reelSet.destroy(); } catch { /* ignore */ }
      liveApps.delete(app);
      ensureGsapDriver();
      try { app.destroy(DESTROY_RENDERER, { children: true }); } catch { /* ignore */ }
    },
  };
}

/** A random grid; `plant` forces one id across a row (a visible win). */
function randomGrid(cfg: VariantConfig, plant?: { id: string; row: number; reels: number[] }): ColumnTarget[] {
  const plain = cfg.ids.filter((id) => id !== cfg.scatter && !id.startsWith('wild/'));
  return Array.from({ length: cfg.reels }, (_, r) => ({
    visible: Array.from({ length: cfg.cells }, (_, c) =>
      plant && plant.reels.includes(r) && c === plant.row ? plant.id : pick(plain)),
  }));
}

/** Intrinsic width / height of a variant's well, for the host's `aspect-ratio`. */
export function landingAspect(variant: LandingVariant): number {
  const cfg = VARIANTS[variant];
  const across = cfg.orientation === 'vertical' ? cfg.reels : cfg.cells;
  const down = cfg.orientation === 'vertical' ? cfg.cells : cfg.reels;
  return (across * (cfg.cell + cfg.gap) - cfg.gap + cfg.pad * 2) / (down * (cfg.cell + cfg.gap) - cfg.gap + cfg.pad * 2);
}

export function LandingReels({ variant, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const cfg = VARIANTS[variant];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let mounted: Mounted | null = null;
    let visible = false;
    const kick = { kicked: false };

    const io = new IntersectionObserver(
      (entries) => { visible = entries[0]?.isIntersecting ?? false; },
      { rootMargin: '120px 0px 120px 0px' },
    );
    io.observe(host);

    const shouldRun = () => alive && visible && !document.hidden;

    const run = async () => {
      try {
        mounted = await mount(host, cfg);
      } catch (err) {
        console.warn('LandingReels: mount failed', err);
        if (alive) setFailed(true);
        return;
      }
      if (!alive) { mounted.destroy(); return; }
      setReady(true);
      const { reelSet } = mounted;

      // Idle the renderer entirely while nothing can be seen.
      const gate = setInterval(() => {
        if (!mounted) return;
        const on = visible && !document.hidden;
        if (on && !mounted.app.ticker.started) mounted.app.ticker.start();
        if (!on && mounted.app.ticker.started && !reelSet.isSpinning) mounted.app.ticker.stop();
      }, 250);

      while (alive) {
        // Wait until on screen.
        while (alive && !shouldRun()) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!alive) break;
        kick.kicked = false;
        try {
          await round(reelSet, cfg, kick);
        } catch (err) {
          if (alive) console.warn('LandingReels: round failed', err);
        }
        await sleep(variant === 'hero' ? 700 : 600, kick);
      }
      clearInterval(gate);
    };
    void run();

    return () => {
      alive = false;
      kick.kicked = true;
      io.disconnect();
      mounted?.destroy();
      mounted = null;
    };
    // The variant never changes for a mounted island.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={`Live ${variant} reels`}
      className={[
        'select-none transition-opacity duration-500 rounded-2xl',
        ready ? 'opacity-100' : 'opacity-0',
        className ?? 'absolute inset-0',
      ].join(' ')}
      data-landing-reels={variant}
      data-ready={ready ? 'true' : undefined}
      data-failed={failed ? 'true' : undefined}
    />
  );
}

/** One round of the loop for a variant. */
async function round(reelSet: ReelSet, cfg: VariantConfig, kick: { kicked: boolean }): Promise<void> {
  if (cfg.tumble) return cascadeRound(reelSet, cfg, kick);

  // Every round shows the mechanic: a line win on the plain sets.
  const row = Math.floor(Math.random() * cfg.cells);
  const id = pick(cfg.ids.filter((s) => s !== cfg.scatter && !s.startsWith('wild/')));
  // A fourth reel only where the set has one (the horizontal variant has three).
  const reelsHit = [0, 1, 2].concat(cfg.reels > 3 && Math.random() < 0.4 ? [3] : []);
  const grid = randomGrid(cfg, { id, row, reels: reelsHit });

  let tease: number[] = [];
  if (cfg.scatter) {
    // Two scatters on the first two reels, so the rest of the row teases.
    grid[0].visible[1] = cfg.scatter;
    grid[1].visible[1] = cfg.scatter;
    if (Math.random() < 0.5) grid[4].visible[1] = cfg.scatter;
    tease = anticipationForScatters(grid, { symbol: cfg.scatter, trigger: 2 });
  }

  const spin = reelSet.spin();
  await sleep(cfg.scatter ? 300 : 350, { kicked: false });
  reelSet.setResult(grid);
  if (tease.length) reelSet.setAnticipation(tease, { stagger: 'sequential', slowdown: { from: 0.45, to: 0.12 } });
  await spin;

  if (!kick.kicked) {
    const positions: SymbolPosition[] = reelsHit.map((r) => ({ reelIndex: r, cellIndex: row }));
    // Losers fade to 30 %; the winners play their wow left to right, 4 f
    // apart, and the line is held for a beat before the next round.
    void reelSet.spotlight.show(positions, { dimAmount: 0.7, playWinAnimation: false });
    const wows: Promise<void>[] = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]!;
      const symbol = reelSet.getReel(pos.reelIndex)?.getSymbolAt(pos.cellIndex);
      if (!symbol) continue;
      if (i > 0) await sleep(67, { kicked: false });
      wows.push(symbol.playWin());
    }
    await Promise.all(wows);
    await sleep(350, kick);
    reelSet.spotlight.hide();
  }
}

async function cascadeRound(reelSet: ReelSet, cfg: VariantConfig, kick: { kicked: boolean }): Promise<void> {
  const hitRow = 1 + Math.floor(Math.random() * (cfg.cells - 1));
  const hitCols = [0, 1, 2].concat(Math.random() < 0.5 ? [3] : []);
  const cluster = pick(cfg.ids);
  const grid = randomGrid(cfg, { id: cluster, row: hitRow, reels: hitCols });
  // Keep the cluster id out of the other cells so the win reads clearly.
  for (let r = 0; r < cfg.reels; r++) {
    for (let c = 0; c < cfg.cells; c++) {
      if (!(hitCols.includes(r) && c === hitRow) && grid[r].visible[c] === cluster) {
        grid[r].visible[c] = pick(cfg.ids.filter((s) => s !== cluster));
      }
    }
  }

  reelSet.setDropOrder('ltr');
  const spin = reelSet.spin();
  await sleep(150, { kicked: false });
  reelSet.setResult(grid);
  await spin;
  await sleep(200, kick);
  if (kick.kicked) return;

  reelSet.setDropOrder('all');
  let detected = false;
  await reelSet.runCascade({
    presentWinners: presentWithSpotlight(reelSet, { hold: 200 }),
    detectWinners: () => {
      if (detected) return [];
      detected = true;
      return hitCols.map((c) => ({ reel: c, cell: hitRow }));
    },
    nextGrid: (prev, winners) => {
      const next = prev.map((reel) => [...reel]);
      for (const w of winners) {
        for (let r = w.cell; r > 0; r--) next[w.reel][r] = next[w.reel][r - 1];
        next[w.reel][0] = pick(cfg.ids.filter((s) => s !== cluster));
      }
      return next.map((visible) => ({ visible }));
    },
    pauseAfterDestroyMs: 220,
  });
}
