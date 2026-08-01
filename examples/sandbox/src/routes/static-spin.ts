/**
 * Static-spin recipe - spin cached snapshot textures instead of live symbols.
 *
 * `StaticSpinSymbol` wraps a plain `SpriteSymbol`: at rest the live symbol
 * shows; while the reel spins, a cached snapshot is shown instead,
 * crossfading into an auto-baked motion-blur variant (no pre-authored blur
 * atlas needed - compare with the default sandbox recipe, which needs one).
 * `prewarmSpinTextures` bakes everything up front so the first spin doesn't
 * hitch. The same wiring works with `SpineReelSymbol` as the inner symbol -
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
    .visibleCells(ROWS)
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

  // Horizontal banner strip above the reels - same wrapper, sideways smear.
  // Its cells are a different size, so it gets its own cache; `axis: 'x'`
  // bakes the blur along the strip's travel direction.
  const STRIP_CELL = 90;
  const stripCache = new SpinTextureCache({ renderer: app.renderer });
  const stripBlur = { axis: 'x' as const };
  const createStripInner = () => new SpriteSymbol({ textures: symbolTextures });
  prewarmSpinTextures({
    cache: stripCache,
    ids: SYMBOLS,
    createSymbol: createStripInner,
    width: STRIP_CELL,
    height: STRIP_CELL,
    blur: stripBlur,
  });
  // v2: a banner is a one-reel set whose strip runs sideways. The old
  // HorizontalReelBuilder is gone (ADR 016 supersedes it) - orientation and
  // direction are now properties of the ordinary builder.
  const strip = new ReelSetBuilder()
    .orientation('horizontal')
    .reels(1)
    .visibleCells(REELS)
    .symbolSize(STRIP_CELL, STRIP_CELL)
    .symbolGap(GAP, 0)
    .symbols((registry) => {
      for (const id of SYMBOLS) {
        registry.register(id, StaticSpinSymbol, {
          createInner: createStripInner,
          cache: stripCache,
          blurRampMs: 140,
          blur: stripBlur,
        });
      }
    })
    .ticker(app.ticker)
    .build();
  strip.x = (width - (REELS * (STRIP_CELL + GAP) - GAP)) / 2;
  strip.y = -STRIP_CELL - GAP * 3;
  reelSet.addChild(strip);
  // Spin the strip alongside the main reels; land it on random ids.
  reelSet.events.on('spin:start', () => {
    const spinP = strip.spin();
    void spinP;
    setTimeout(() => {
      strip.setResult([
        { visible: Array.from({ length: REELS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]) },
      ]);
    }, 900);
  });
  // Expose for console poking alongside __PIXI_REELS_DEBUG.
  (window as unknown as { __STRIP: unknown }).__STRIP = strip;
  const nextResult = (): string[][] =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    );

  return { reelSet, width, height, nextResult };
}
