/**
 * `@pixi-reels/kit`: what the docs recipes run on besides the library.
 *
 * Example symbols, the bundled asset kits, the small helpers every demo
 * reaches for, and the contract a recipe module is written against. None of
 * it is engine API: copy what you need into your game.
 *
 * Anything that pulls the Spine runtime in lives at `@pixi-reels/kit/spine`,
 * so a page of card-symbol demos never downloads it.
 */
export { pickWeighted } from './pickWeighted.js';
export { readout, setReadouts, readoutsEnabled } from './readout.js';
export { createAssets } from './assets.js';
export type { RecipeAssets } from './assets.js';
export type {
  RecipeContext,
  RecipeEventBus,
  RecipeFn,
  RecipeMeta,
  RecipeModule,
  RecipeNeed,
  RecipeResult,
  RecipeSounds,
} from './recipe.js';

export { BlurSpriteSymbol } from './BlurSpriteSymbol.js';
export type { BlurSpriteSymbolOptions } from './BlurSpriteSymbol.js';
export {
  CoinSymbol,
  COIN_TIER,
  COIN_FEATURE,
  COIN_MYSTERY,
  COIN_TRIGGER,
  coinValue,
  coinMultiplier,
  drawCoin,
} from './CoinSymbol.js';
export type { CoinSymbolOptions, CoinShapeOptions } from './CoinSymbol.js';

export { loadPrototypeSymbols, PROTOTYPE_SYMBOL_IDS } from './prototypeSpriteLoader.js';
export type { PrototypeTextureSet } from './prototypeSpriteLoader.js';

export { SPINE_SETS, SPINE_SET_IDS, loadSpineSet } from './spineSets.js';
export type { SpineSet, SizedSpineSet, SpineSetId, LoadedSpineSet } from './spineSets.js';
export {
  GENERATED_SPINE_NAMES,
  GENERATED_ATLAS_ALIAS,
  loadGeneratedSpines,
  buildSpineMap,
} from './generatedSpineLoader.js';
export type { GeneratedSpineName } from './generatedSpineLoader.js';
export {
  THUNDERKICK_ATLAS,
  THUNDERKICK_SKELETONS,
  THUNDERKICK_SYMBOL_IDS,
  loadThunderkickSpines,
  buildThunderkickSpineMap,
} from './thunderkickSpineLoader.js';
export type { ThunderkickSkeleton, ThunderkickSymbolId } from './thunderkickSpineLoader.js';
export {
  CASCADE_ATLAS,
  CASCADE_SKELETONS,
  CASCADE_SYMBOL_IDS,
  CASCADE_PLATE_W,
  CASCADE_PLATE_H,
  loadCascadeSpines,
  buildCascadeSpineMap,
} from './cascadeSpineLoader.js';
export type { CascadeSkeleton, CascadeSymbolId } from './cascadeSpineLoader.js';

export { loadHoldAndWinSprites } from './holdAndWinSprites.js';
export type { HoldAndWinSprites } from './holdAndWinSprites.js';

export {
  CLOVER_CELL,
  CLOVER_FRUITS,
  CLOVER_FEATURES,
  CLOVER_SPEED,
  CLOVER_REEL_SPEED,
  CLOVER_SPEEDS,
  CLOVER_CELL_RADIUS,
  loadHwClover,
  CloverSymbol,
  cloverCellMask,
  cloverGridBackground,
} from './hwClover.js';
export type { HwCloverArt, CloverSymbolOptions, CloverGridOptions } from './hwClover.js';
