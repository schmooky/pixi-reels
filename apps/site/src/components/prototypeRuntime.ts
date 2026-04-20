import { Application, Graphics } from 'pixi.js';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
  type ReelSet,
} from 'pixi-reels';
import { gsap } from 'gsap';
import {
  BlurSpriteSymbol,
} from '../../../../examples/shared/BlurSpriteSymbol.ts';
import {
  loadPrototypeSymbols,
  type PrototypeTextureSet,
} from '../../../../examples/shared/prototypeSpriteLoader.ts';

let gsapSynced = false;
function syncGsap(app: Application): void {
  if (gsapSynced) return;
  gsapSynced = true;
  try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
  app.ticker.add((ticker) => { gsap.updateRoot(ticker.lastTime / 1000); });
}

export interface PrototypeMountConfig {
  reelCount: number;
  visibleRows: number;
  symbolSize: { width: number; height: number };
  /** Atlas frame names to use as symbol ids (`family/name`). */
  symbolIds: string[];
  weights?: Record<string, number>;
  /**
   * Swap every visible symbol to its `_blur` variant on phase:enter 'spin'
   * and back to crisp on phase:enter 'stop'. Default true.
   */
  blurOnSpin?: boolean;
}

export interface PrototypeMountHandle {
  app: Application;
  reelSet: ReelSet;
  textures: PrototypeTextureSet;
  destroy: () => void;
}

let atlasPromise: Promise<PrototypeTextureSet> | null = null;
async function ensureAtlasLoaded(): Promise<PrototypeTextureSet> {
  if (!atlasPromise) atlasPromise = loadPrototypeSymbols();
  return atlasPromise;
}

/**
 * Boot a compact prototype-symbols sprite-backed reel set into `host`.
 * All symbols use `BlurSpriteSymbol` wired to the TexturePacker atlas.
 */
export async function mountPrototypeReels(
  host: HTMLDivElement,
  cfg: PrototypeMountConfig,
): Promise<PrototypeMountHandle> {
  const textures = await ensureAtlasLoaded();

  const size = cfg.symbolSize;
  const padX = 10, padY = 10, gap = 6;
  const width = cfg.reelCount * (size.width + gap) - gap + padX * 2 + 40;
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

  // Build the per-id texture + blurTexture submaps for the symbols we actually use.
  const used: Record<string, import('pixi.js').Texture> = {};
  const usedBlur: Record<string, import('pixi.js').Texture> = {};
  for (const id of cfg.symbolIds) {
    const base = textures.textures[id];
    if (!base) throw new Error(`prototype-symbols atlas missing frame "${id}"`);
    used[id] = base;
    const blur = textures.blurTextures[id];
    if (blur) usedBlur[id] = blur;
  }

  const reelSet = new ReelSetBuilder()
    .reels(cfg.reelCount)
    .visibleSymbols(cfg.visibleRows)
    .symbolSize(size.width, size.height)
    .symbolGap(gap, gap)
    .symbols((r) => {
      for (const id of cfg.symbolIds) {
        r.register(id, BlurSpriteSymbol, {
          textures: used,
          blurTextures: usedBlur,
          anchor: { x: 0.5, y: 0.5 },
          fit: true,
        });
      }
    })
    .weights(cfg.weights ?? {})
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  // Warm well frame (matches `--code-bg` token the rest of the site uses).
  const frame = new Graphics();
  const totalW = cfg.reelCount * (size.width + gap) - gap + padX * 2;
  const totalH = cfg.visibleRows * (size.height + gap) - gap + padY * 2;
  frame.roundRect(0, 0, totalW, totalH, 16)
    .fill({ color: 0xffffff, alpha: 1 })
    .roundRect(0, 0, totalW, totalH, 16)
    .stroke({ color: 0xe5dccf, width: 1, alpha: 0.9 });
  frame.x = (width - totalW) / 2;
  frame.y = (height - totalH) / 2;
  app.stage.addChild(frame);

  reelSet.x = frame.x + padX;
  reelSet.y = frame.y + padY;
  app.stage.addChild(reelSet);

  enableDebug(reelSet);

  // Blur-on-spin: per-reel toggle based on phase transitions.
  //
  // Symbols wrap in during SPIN (each wrap acquires a fresh pooled symbol).
  // We also listen to `symbol:created` so newly-wrapped-in cells inherit the
  // reel's current blur state — not just the ones present at phase:enter.
  if (cfg.blurOnSpin ?? true) {
    const blurring = new Array<boolean>(cfg.reelCount).fill(false);
    for (let r = 0; r < cfg.reelCount; r++) {
      const reel = reelSet.getReel(r);
      reel.events.on('phase:enter', (phaseName) => {
        if (phaseName === 'spin') {
          blurring[r] = true;
          setReelBlur(reelSet, r, cfg.visibleRows, true);
        } else if (phaseName === 'stop') {
          blurring[r] = false;
          setReelBlur(reelSet, r, cfg.visibleRows, false);
        }
      });
      reel.events.on('symbol:created', () => {
        if (blurring[r]) setReelBlur(reelSet, r, cfg.visibleRows, true);
      });
    }
    reelSet.events.on('skip:requested', () => {
      for (let r = 0; r < cfg.reelCount; r++) {
        blurring[r] = false;
        setReelBlur(reelSet, r, cfg.visibleRows, false);
      }
    });
  }

  return {
    app,
    reelSet,
    textures,
    destroy() {
      try { reelSet.destroy(); } catch {}
      try { app.destroy(true, { children: true }); } catch {}
    },
  };
}

function setReelBlur(reelSet: ReelSet, reelIndex: number, visibleRows: number, blurred: boolean): void {
  const reel = reelSet.getReel(reelIndex);
  for (let row = 0; row < visibleRows; row++) {
    const sym = reel.getSymbolAt(row);
    if (sym instanceof BlurSpriteSymbol) sym.setBlurred(blurred);
  }
}
