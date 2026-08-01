/**
 * The single source of truth for the variables a recipe body can reference.
 *
 * Three runtimes evaluate recipe-shaped code: `RecipeRunner` (the docs
 * demos), `Studio` (the editable playground), and `ShareViewer` (a shared
 * studio link). Each built its own `new AsyncFunction(...names, src)` call
 * with a hand-maintained parameter list, and a comment in each asking the
 * next person to keep all three in lock-step.
 *
 * That failed, quietly and completely: 26 names reached `RecipeRunner` and
 * never reached the other two, so "Open in Studio" on a hold-and-win, a
 * static-spin, an anticipation or any thunderkick / cascade spine recipe
 * died with `Can't find variable: ...` - and only at run time, since the
 * recipe bodies are `@ts-nocheck` strings.
 *
 * So the list stopped being a list. A runtime now builds ONE object here and
 * spreads its keys into the function signature, which makes divergence
 * impossible rather than merely discouraged.
 */
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  AnimatedSpriteSymbol,
  BoardGrid,
  EmptySymbol,
  HoldAndWinBuilder,
  ReelSymbol,
  RectMaskStrategy,
  SharedRectMaskStrategy,
  SpeedPresets,
  SpinTextureCache,
  SpriteSymbol,
  StaticSpinSymbol,
  WinPresenter,
  anticipationForScatters,
  prewarmSpinTextures,
} from 'pixi-reels';
import { SpineReelSymbol } from 'pixi-reels/spine';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { CardSymbol, CARD_DECK, WILD_CARD } from '../../../../examples/shared/CardSymbol.ts';
import {
  CoinSymbol,
  COIN_TIER,
  COIN_FEATURE,
  COIN_MYSTERY,
  COIN_TRIGGER,
  coinValue,
  coinMultiplier,
  drawCoin,
} from '../../../../examples/shared/CoinSymbol.ts';
import {
  GoldCoinSymbol,
  coinWaves,
  bezierFly,
  settleMoneyFace,
  freezeAtEnd,
  fitText,
} from '../../../../examples/shared/holdAndWinFx.ts';
import { loadHoldAndWinSprites } from '../../../../examples/shared/holdAndWinSprites.ts';
import {
  loadGeneratedSpines,
  buildSpineMap,
} from '../../../../examples/shared/generatedSpineLoader.ts';
import {
  loadThunderkickSpines,
  buildThunderkickSpineMap,
  THUNDERKICK_SYMBOL_IDS,
} from '../../../../examples/shared/thunderkickSpineLoader.ts';
import {
  loadCascadeSpines,
  buildCascadeSpineMap,
  CASCADE_SYMBOL_IDS,
  CASCADE_PLATE_W,
  CASCADE_PLATE_H,
} from '../../../../examples/shared/cascadeSpineLoader.ts';
import {
  SPINE_SETS,
  SPINE_SET_IDS,
  loadSpineSet,
} from '../../../../examples/shared/spineSets.ts';

/** Per-runtime values. Everything else is the same in all three. */
export interface RecipeGlobalsEnv {
  app: PIXI.Application;
  textures: Record<string, PIXI.Texture>;
  blurTextures: Record<string, PIXI.Texture>;
  SYMBOL_IDS: string[];
  pickWeighted: (weights: Record<string, number>) => string;
  /**
   * Studio swaps in a wrapped builder that folds the user's uploaded symbol
   * data into every `.build()`. The other two pass the real class.
   */
  ReelSetBuilder: unknown;
  /** Studio-only. `{}` elsewhere, so a shared recipe referencing them still runs. */
  userSymbols?: Record<string, unknown>;
  userSymbolData?: Record<string, unknown>;
}

/**
 * Build the name -> value map every recipe runtime injects.
 *
 * Call it, then spread `Object.keys(...)` into the function signature and
 * `Object.values(...)` into the call. Never hand-write either list.
 */
export function buildRecipeGlobals(env: RecipeGlobalsEnv): Record<string, unknown> {
  return {
    // Engine surface
    ReelSetBuilder: env.ReelSetBuilder,
    SpeedPresets,
    WinPresenter,
    EmptySymbol,
    ReelSymbol,
    SpriteSymbol,
    AnimatedSpriteSymbol,
    RectMaskStrategy,
    SharedRectMaskStrategy,
    HoldAndWinBuilder,
    BoardGrid,
    anticipationForScatters,
    SpinTextureCache,
    StaticSpinSymbol,
    prewarmSpinTextures,

    // Host environment
    app: env.app,
    textures: env.textures,
    blurTextures: env.blurTextures,
    SYMBOL_IDS: env.SYMBOL_IDS,
    pickWeighted: env.pickWeighted,
    gsap,
    PIXI,

    // Example symbol kits
    BlurSpriteSymbol,
    CardSymbol,
    CARD_DECK,
    WILD_CARD,
    CoinSymbol,
    COIN_TIER,
    COIN_FEATURE,
    COIN_MYSTERY,
    COIN_TRIGGER,
    coinValue,
    coinMultiplier,
    drawCoin,
    GoldCoinSymbol,
    coinWaves,
    bezierFly,
    settleMoneyFace,
    freezeAtEnd,
    fitText,
    loadHoldAndWinSprites,

    // Spine: the registry is the way to reach a bundled set. The individual
    // loaders stay exposed because existing recipes call them directly.
    SpineReelSymbol,
    Spine,
    SPINE_SETS,
    SPINE_SET_IDS,
    loadSpineSet,
    loadGeneratedSpines,
    buildSpineMap,
    loadThunderkickSpines,
    buildThunderkickSpineMap,
    THUNDERKICK_SYMBOL_IDS,
    loadCascadeSpines,
    buildCascadeSpineMap,
    CASCADE_SYMBOL_IDS,
    CASCADE_PLATE_W,
    CASCADE_PLATE_H,

    // Studio-only. Present (empty) everywhere so a shared studio snippet
    // that touches them runs in the docs runner too.
    userSymbols: env.userSymbols ?? {},
    userSymbolData: env.userSymbolData ?? {},
  };
}

/**
 * Evaluate a recipe body with the shared globals in scope.
 *
 * `AsyncFunction` so a recipe needing async setup (spine loading, texture
 * fetches) can `await` before returning. Sync recipes are unaffected:
 * `await x` on a non-Promise resolves to x.
 */
export async function runRecipeSource<T>(
  compiledJs: string,
  env: RecipeGlobalsEnv,
  trailer = '',
): Promise<T> {
  const globals = buildRecipeGlobals(env);
  const names = Object.keys(globals);
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as FunctionConstructor;
  const factory = new AsyncFunction(...names, `"use strict"; ${compiledJs}${trailer}`);
  return (await factory(...names.map((n) => globals[n]))) as T;
}
