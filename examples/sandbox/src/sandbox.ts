/**
 * ============================================================================
 *  pixi-reels — SANDBOX
 * ============================================================================
 *
 * Edit this file and save. Vite HMR reloads the page and rebuilds the reels.
 *
 * The `buildSandbox` function receives a PixiJS Application + the preloaded
 * prototype-symbols atlas textures, and must return a
 * `{ reelSet, width, height, nextResult }` tuple. `main.ts` handles
 * centering, spin wiring, and the UI.
 *
 * Below are **copy-paste recipes** for every feature pixi-reels ships with.
 * The active configuration is the uncommented block — swap recipes in/out to
 * experiment.
 * ============================================================================
 */
import type { Application, Texture } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, type ReelSet, enableDebug } from 'pixi-reels';
import { BlurSpriteSymbol } from '../../shared/BlurSpriteSymbol.js';
import { buildPyramid } from './routes/pyramid.js';
import { buildMultiWays } from './routes/multiways.js';
import { buildExpandingWild } from './routes/expanding-wild.js';
import { buildBigSymbols } from './routes/big-symbols.js';

export interface SandboxContext {
  app: Application;
  textures: Record<string, Texture>;
  blurTextures: Record<string, Texture>;
}

export interface SandboxResult {
  reelSet: ReelSet;
  width: number;
  height: number;
  /** Called each spin to produce the target symbol grid. */
  nextResult: () => string[][];
}

// Swap this assignment to try a recipe from `./routes/*`. Set to `null` to
// run the inline default classic 5×3 below.
//   buildPyramid | buildMultiWays | buildExpandingWild | buildBigSymbols
const ACTIVE_ROUTE: ((ctx: SandboxContext) => SandboxResult) | null = null;
void buildPyramid; void buildMultiWays; void buildExpandingWild; void buildBigSymbols;

const REELS = 5;
const ROWS = 3;
const SYMBOL_SIZE = 140;
const GAP = 8;

const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1',
  low2: 'round/round_2',
  low3: 'round/round_3',
  low4: 'round/round_4',
  med1: 'royal/royal_1',
  med2: 'royal/royal_2',
  high1: 'royal/royal_3',
  high2: 'royal/royal_4',
  wild: 'wild/wild_1',
};
const SYMBOLS = Object.keys(SYMBOL_MAP);

export function buildSandbox(ctx: SandboxContext): SandboxResult {
  if (ACTIVE_ROUTE) return ACTIVE_ROUTE(ctx);

  const { app, textures, blurTextures } = ctx;
  const symbolTextures: Record<string, Texture> = {};
  const symbolBlurTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
    if (blurTextures[atlasKey]) symbolBlurTextures[id] = blurTextures[atlasKey];
  }

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleSymbols(ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(GAP, GAP)
    .symbols((registry) => {
      for (const id of SYMBOLS) {
        registry.register(id, BlurSpriteSymbol, {
          textures: symbolTextures,
          blurTextures: symbolBlurTextures,
        });
      }
    })
    .weights({
      low1: 18, low2: 18, low3: 18, low4: 18,
      med1: 12, med2: 12,
      high1: 6, high2: 6,
      wild: 3,
    })

    // ── RECIPE: Symbol z-index override — wild renders above its neighbours.
    // Useful for sticky/expanding wilds, bonus icons, etc.
    .symbolData({
      wild: { weight: 3, zIndex: 5 },
    })

    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .ticker(app.ticker)
    .build();

  // ── RECIPE: Auto-blur during spin. Toggles the BlurSpriteSymbol's blurred
  // texture whenever a reel enters the SPIN phase and back to crisp on STOP.
  for (const reel of reelSet.reels) {
    reel.events.on('phase:enter', (name) => {
      const blurred = name === 'spin';
      for (let row = 0; row < ROWS; row++) {
        const sym = reel.getSymbolAt(row);
        if (sym instanceof BlurSpriteSymbol) sym.setBlurred(blurred);
      }
    });
  }

  // ── RECIPE: Expose window.__PIXI_REELS_DEBUG for eval/DevTools
  enableDebug(reelSet);

  // ── RECIPE: Per-reel stop delays, applied per-spin
  //   reelSet.setStopDelays([0, 140, 280, 600, 1100]);
  //   reelSet.setAnticipation([3, 4]);

  const width = REELS * (SYMBOL_SIZE + GAP) - GAP;
  const height = ROWS * (SYMBOL_SIZE + GAP) - GAP;

  const nextResult = (): string[][] => {
    return Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => pickWeighted()),
    );
  };

  return { reelSet, width, height, nextResult };
}

function pickWeighted(): string {
  const r = Math.random();
  if (r < 0.03) return 'wild';
  if (r < 0.09) return 'high1';
  if (r < 0.15) return 'high2';
  if (r < 0.27) return 'med1';
  if (r < 0.39) return 'med2';
  if (r < 0.54) return 'low1';
  if (r < 0.69) return 'low2';
  if (r < 0.84) return 'low3';
  return 'low4';
}

// ============================================================================
//  PER-REEL GEOMETRY / MULTIWAYS / BIG SYMBOLS / EXPANDING WILDS
// ============================================================================
//
// Each route in `./routes/` is a complete `buildSandbox`-shaped function.
// To try one, set `ACTIVE_ROUTE = buildXxx` near the top of this file.
//
// Available routes:
//   - ./routes/pyramid.js          — static 3-5-5-5-3 pyramid
//   - ./routes/multiways.js         — per-spin row variation (2..7 rows)
//   - ./routes/expanding-wild.js   — wild expands its full column for one spin
//   - ./routes/big-symbols.js      — 2×2 bonus block via SymbolData.size
//
// ============================================================================
//  MORE RECIPES (uncomment/adapt in the block above)
// ============================================================================
//
// ── Custom speed profile
//   .speed('chill', { ...SpeedPresets.NORMAL, bounceDistance: 90, bounceDuration: 900 })
//
// ── Custom buffer size (e.g. 2 rows above/below the visible area so "big"
//    symbols can animate partly off-screen)
//   .bufferSymbols(2)
//
// ── Listen to lifecycle events (add in main.ts or via reelSet.events.on)
//   reelSet.events.on('spin:reelLanded', (reelIndex, symbols) => {
//     console.log(`Reel ${reelIndex} landed on`, symbols);
//   });
//   reelSet.events.on('spin:complete', (result) => {
//     console.log('Spin took', Math.round(result.duration), 'ms');
//   });
//
// ── Spotlight winning symbols
//   reelSet.spotlight.show([{ reelIndex: 0, rowIndex: 1 }, { reelIndex: 1, rowIndex: 1 }]);
//   reelSet.spotlight.hide();
//
// ── Spine symbols (optional — requires @esotericsoftware/spine-pixi-v8)
//   import { SpineReelSymbol } from 'pixi-reels/spine';
//   registry.register('wild', SpineReelSymbol, {
//     spineMap: { wild: { skeleton: 'wildData', atlas: 'myAtlas' } },
//     autoPlayBlur: true,
//     autoPlayLanding: true,
//   });
