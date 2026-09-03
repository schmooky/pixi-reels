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
  AdjustPhase,
  AnimatedSpriteSymbol,
  AnticipationPhase,
  BoardGrid,
  CascadeDropInPhase,
  CascadeFallPhase,
  CascadePlacePhase,
  EmptySymbol,
  HoldAndWinBuilder,
  ReelPhase,
  ReelSymbol,
  PathMaskStrategy,
  RectMaskStrategy,
  RoundedRectMaskStrategy,
  SharedRectMaskStrategy,
  SilhouetteMaskStrategy,
  SpeedPresets,
  SpinPhase,
  SpinTextureCache,
  SpriteSymbol,
  StartPhase,
  StaticSpinSymbol,
  StopPhase,
  WinPresenter,
  anticipationForScatters,
  composeMasks,
  inset,
  prewarmSpinTextures,
  resolveTumbleConfig,
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

/**
 * The Spine half of the surface, loaded ON DEMAND.
 *
 * The Spine runtime plus the three bundled loaders is a ~180 KB chunk. Every
 * recipe page used to download it because the runtimes imported it
 * statically - including pages whose demos are all `CardSymbol`, which is
 * most of them. A dynamic import keeps it off those pages entirely.
 */
async function loadSpineGlobals(): Promise<Record<string, unknown>> {
  const [spine, spineRuntime, generated, thunderkick, cascade, sets] = await Promise.all([
    import('pixi-reels/spine'),
    import('@esotericsoftware/spine-pixi-v8'),
    import('../runtime/generatedSpineLoader.ts'),
    import('../runtime/thunderkickSpineLoader.ts'),
    import('../runtime/cascadeSpineLoader.ts'),
    import('../runtime/spineSets.ts'),
  ]);
  return {
    SpineReelSymbol: spine.SpineReelSymbol,
    Spine: spineRuntime.Spine,
    SPINE_SETS: sets.SPINE_SETS,
    SPINE_SET_IDS: sets.SPINE_SET_IDS,
    loadSpineSet: sets.loadSpineSet,
    loadGeneratedSpines: generated.loadGeneratedSpines,
    buildSpineMap: generated.buildSpineMap,
    loadThunderkickSpines: thunderkick.loadThunderkickSpines,
    buildThunderkickSpineMap: thunderkick.buildThunderkickSpineMap,
    THUNDERKICK_SYMBOL_IDS: thunderkick.THUNDERKICK_SYMBOL_IDS,
    loadCascadeSpines: cascade.loadCascadeSpines,
    buildCascadeSpineMap: cascade.buildCascadeSpineMap,
    CASCADE_SYMBOL_IDS: cascade.CASCADE_SYMBOL_IDS,
    CASCADE_PLATE_W: cascade.CASCADE_PLATE_W,
    CASCADE_PLATE_H: cascade.CASCADE_PLATE_H,
  };
}

/**
 * The hold-and-win FX kit, loaded ON DEMAND.
 *
 * `GoldCoinSymbol extends SpineReelSymbol`, so importing this kit statically
 * pulls the whole Spine runtime in behind it - which is why making the spine
 * globals lazy on their own changed nothing. Both groups have to be dynamic
 * for a card-symbol page to stay light.
 */
async function loadHoldAndWinGlobals(): Promise<Record<string, unknown>> {
  const [fx, sprites] = await Promise.all([
    import('../runtime/holdAndWinFx.ts'),
    import('../runtime/holdAndWinSprites.ts'),
  ]);
  return {
    GoldCoinSymbol: fx.GoldCoinSymbol,
    coinWaves: fx.coinWaves,
    bezierFly: fx.bezierFly,
    settleMoneyFace: fx.settleMoneyFace,
    freezeAtEnd: fx.freezeAtEnd,
    fitText: fx.fitText,
    loadHoldAndWinSprites: sprites.loadHoldAndWinSprites,
  };
}

async function loadHwCloverGlobals(): Promise<Record<string, unknown>> {
  const clover = await import('../runtime/hwClover.ts');
  return {
    loadHwClover: clover.loadHwClover,
    CloverSymbol: clover.CloverSymbol,
    cloverGridBackground: clover.cloverGridBackground,
    CLOVER_CELL: clover.CLOVER_CELL,
    CLOVER_FRUITS: clover.CLOVER_FRUITS,
    CLOVER_FEATURES: clover.CLOVER_FEATURES,
  };
}

/**
 * Heavy groups a recipe only pays for if it mentions them. Each test is
 * deliberately generous: a false positive costs one unnecessary chunk fetch,
 * a false negative is `Can't find variable` at run time.
 */
const LAZY_GROUPS: Array<{ test: RegExp; load: () => Promise<Record<string, unknown>> }> = [
  // Every Spine global's name contains "pine".
  { test: /[Ss]pine|SPINE/, load: loadSpineGlobals },
  {
    test: /GoldCoinSymbol|coinWaves|bezierFly|settleMoneyFace|freezeAtEnd|fitText|loadHoldAndWinSprites/,
    load: loadHoldAndWinGlobals,
  },
  // The clover (rectangular-cell) Hold & Win kit: one sheet, no Spine.
  { test: /loadHwClover|CloverSymbol|cloverGridBackground|CLOVER_/, load: loadHwCloverGlobals },
];

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
export function buildRecipeGlobals(
  env: RecipeGlobalsEnv,
  lazy: Record<string, unknown> = {},
): Record<string, unknown> {
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
    RoundedRectMaskStrategy,
    SilhouetteMaskStrategy,
    PathMaskStrategy,
    composeMasks,
    inset,
    HoldAndWinBuilder,
    BoardGrid,
    anticipationForScatters,
    SpinTextureCache,
    StaticSpinSymbol,
    prewarmSpinTextures,

    // Phase classes. `ReelPhase` for a phase written from scratch, the
    // built-ins so a recipe can SUBCLASS one and register the subclass over
    // it. Already in the pixi-reels bundle, so this costs no extra chunk.
    ReelPhase,
    StartPhase,
    SpinPhase,
    StopPhase,
    AnticipationPhase,
    AdjustPhase,
    CascadeFallPhase,
    CascadePlacePhase,
    CascadeDropInPhase,
    // Fills a partial `.tumble(...)` config out to the shape the three cascade
    // phase constructors take. required to SUBCLASS one of them.
    resolveTumbleConfig,

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

    // Heavy optional groups (Spine, hold-and-win FX) are merged in only for
    // recipes that mention them, so a card-symbol page never downloads the
    // Spine runtime. See LAZY_GROUPS.
    ...lazy,

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
  const loaded = await Promise.all(
    LAZY_GROUPS.filter((g) => g.test.test(compiledJs)).map((g) => g.load()),
  );
  const globals = buildRecipeGlobals(env, Object.assign({}, ...loaded));
  const names = Object.keys(globals);
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as FunctionConstructor;
  const factory = new AsyncFunction(...names, `"use strict"; ${compiledJs}${trailer}`);
  return (await factory(...names.map((n) => globals[n]))) as T;
}
