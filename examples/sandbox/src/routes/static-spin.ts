/**
 * Static-spin recipe — spin cached snapshot textures instead of live symbols.
 *
 * `StaticSpinSymbol` wraps a plain `SpriteSymbol`: at rest the live symbol
 * shows; while the reel spins, a cached snapshot is shown instead,
 * crossfading into an auto-baked motion-blur variant (no pre-authored blur
 * atlas needed — compare with the default sandbox recipe, which needs one).
 * `prewarmSpinTextures` bakes everything up front so the first spin doesn't
 * hitch. The same wiring works with `SpineReelSymbol` as the inner symbol —
 * that's the "spin static, not Spine" setup.
 *
 * To try it: in sandbox.ts, set `ACTIVE_ROUTE = buildStaticSpin`.
 */
import type { Texture } from 'pixi.js';
import {
  ReelSetBuilder,
  SpeedPresets,
  SpinTextureCache,
  SpriteSymbol,
  StaticSpinSymbol,
  enableDebug,
  prewarmSpinTextures,
} from 'pixi-reels';
import type { SandboxContext, SandboxResult } from '../sandbox.js';

const SYMBOLS = ['low1', 'low2', 'low3', 'med1', 'med2', 'high1', 'high2', 'wild'];
const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1', low2: 'round/round_2', low3: 'round/round_3',
  med1: 'royal/royal_1', med2: 'royal/royal_2',
  high1: 'royal/royal_3', high2: 'royal/royal_4',
  wild: 'wild/wild_1',
};
const REELS = 5;
const ROWS = 3;
const SYMBOL_SIZE = 140;
const GAP = 8;

export function buildStaticSpin({ app, textures }: SandboxContext): SandboxResult {
  const symbolTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
  }

  const cache = new SpinTextureCache({ renderer: app.renderer });
  const createInner = () => new SpriteSymbol({ textures: symbolTextures });

  // Bake every snapshot + blur variant before the first spin.
  prewarmSpinTextures({
    cache,
    ids: SYMBOLS,
    createSymbol: createInner,
    width: SYMBOL_SIZE,
    height: SYMBOL_SIZE,
  });

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleRows(ROWS)
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(GAP, GAP)
    .symbols((registry) => {
      for (const id of SYMBOLS) {
        registry.register(id, StaticSpinSymbol, {
          createInner,
          cache,
          blurRampMs: 140,
        });
      }
    })
    .weights({ low1: 18, low2: 18, low3: 18, med1: 12, med2: 12, high1: 6, high2: 6, wild: 3 })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .speed('superTurbo', SpeedPresets.SUPER_TURBO)
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  const width = REELS * (SYMBOL_SIZE + GAP) - GAP;
  const height = ROWS * (SYMBOL_SIZE + GAP) - GAP;
  const nextResult = (): string[][] =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    );

  return { reelSet, width, height, nextResult };
}
