/**
 * `@pixi-reels/kit`: what the docs recipes run on besides the library.
 *
 * Example symbols, the bundled asset kits, the small helpers every demo
 * reaches for, and the contract a recipe module is written against. None of
 * it is engine API: copy what you need into your game.
 *
 * Anything that pulls the Spine runtime in lives at `@pixi-reels/kit/spine`,
 * so a page of card-symbol demos never downloads it; the sound set and the
 * zvuk engine live at `@pixi-reels/kit/sound`, the pay-ways evaluator at
 * `@pixi-reels/kit/ways`.
 */
export { pickWeighted } from './pickWeighted.js';
export { readout, setReadouts, readoutsEnabled } from './readout.js';
export { fitText } from './fitText.js';
export { tapToSpin, ownTap, CUE_STRIP } from './tapToSpin.js';
export type { TapToSpinOptions, TapToSpinHandle } from './tapToSpin.js';
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
} from './recipe.js';

export { StickerSymbol } from './StickerSymbol.js';
export type { StickerSymbolOptions } from './StickerSymbol.js';
export {
  loadGenericSymbols,
  genericIdOf,
  GENERIC_SYMBOL_IDS,
  GENERIC_SYMBOL_NAMES,
  GENERIC_WEIGHTS,
  GENERIC_HUES,
  GENERIC_ALIASES,
  FRAME_COLORS,
  FRAME_OF,
  FRAME_METRICS,
  FRAME_SCALE,
  PILLAR_METRICS,
  PILLAR_PARTS,
} from './genericSymbols.js';
export type { GenericSymbolId, GenericSymbolSet, FrameColor, PillarVariant, PillarPart } from './genericSymbols.js';
export { WildPillar } from './pillar.js';
export { playMotion, resetMotion, MOTION, EASE, FRAMES, frames, seconds, REST } from './motion.js';
export type { MotionName, MotionPrimitive, MotionStep, MotionState, MotionRig, MotionHandle, EaseName, FrameName } from './motion.js';
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
} from './CoinSymbol.js';
export type { CoinSymbolOptions, CoinShapeOptions } from './CoinSymbol.js';

export { loadPrototypeSymbols, PROTOTYPE_SYMBOL_IDS } from './prototypeSpriteLoader.js';
export type { PrototypeTextureSet } from './prototypeSpriteLoader.js';

// The three bundled Spine sets, behind one registry. `buildSpineMap` is the
// one per-set helper worth a name: it maps your symbol ids onto the generated
// skeletons when the identity map is not what you want.
export { SPINE_SETS, SPINE_SET_IDS, loadSpineSet } from './spineSets.js';
export type { SpineSet, SizedSpineSet, SpineSetId, LoadedSpineSet } from './spineSets.js';
export { buildSpineMap } from './generatedSpineLoader.js';
export type { GeneratedSpineName } from './generatedSpineLoader.js';

export type { HoldAndWinSprites } from './holdAndWinSprites.js';

export {
  CLOVER_CELL,
  CLOVER_FRUITS,
  CLOVER_FEATURES,
  CLOVER_SPEED,
  CLOVER_REEL_SPEED,
  CLOVER_SPEEDS,
  CLOVER_CELL_RADIUS,
  CloverSymbol,
  cloverCellMask,
  cloverGridBackground,
} from './hwClover.js';
export type { HwCloverArt, CloverSymbolOptions, CloverGridOptions } from './hwClover.js';
