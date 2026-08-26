// Core
export { ReelSet } from './core/ReelSet.js';
export { ReelSetBuilder } from './core/ReelSetBuilder.js';
export { Reel } from './core/Reel.js';
export type { ReelConfig, NudgeOptions } from './core/Reel.js';
export { ReelViewport } from './core/ReelViewport.js';
export { reelAxis, VERTICAL_FORWARD } from './core/ReelAxis.js';
export type { ReelAxis, Orientation, Direction } from './core/ReelAxis.js';
export { ReelCurve, resolveCurveConfig } from './core/ReelCurve.js';
export { ReelWarp } from './core/ReelWarp.js';
export type { ReelCurveConfig, ReelCurveInput, CurveFocus, CurveMode } from './core/ReelCurve.js';
export { CURVE_FOCUS_WEIGHT } from './core/ReelCurve.js';

// Config
export { SpeedPresets } from './config/SpeedPresets.js';
export { DEFAULTS } from './config/defaults.js';
export type {
  SpeedProfile,
  SpinOptions,
  SymbolData,
  ReelGridConfig,
  ReelExtraSymbols,
  ReelCellQuad,
  ReelCellInset,
  TrapezoidConfig,
  NoOffsetConfig,
  OffsetConfig,
  CrossOffsetMode,
  Matrix,
  Position,
  CellBounds,
  SymbolPosition,
  Win,
  MaskConfig,
  MultiWaysConfig,
  ReelAnchor,
  Stacking,
  AnticipationStagger,
  AnticipationSlowdown,
  AnticipationOptions,
  AnticipationProtect,
  SlamOptions,
} from './config/types.js';
export type { ReelMaskRect, MaskStrategy, MaskContext } from './core/ReelViewport.js';
export {
  MASK_STRATEGY_VERSION,
  RectMaskStrategy,
  SharedRectMaskStrategy,
} from './core/ReelViewport.js';

// Symbols
export { ReelSymbol } from './symbols/ReelSymbol.js';
export { SpriteSymbol } from './symbols/SpriteSymbol.js';
export type { SpriteSymbolOptions } from './symbols/SpriteSymbol.js';
export { AnimatedSpriteSymbol } from './symbols/AnimatedSpriteSymbol.js';
export type { AnimatedSpriteSymbolOptions } from './symbols/AnimatedSpriteSymbol.js';
export { SpineSymbol, whenSpineReady } from './symbols/SpineSymbol.js';
export type { SpineSymbolOptions } from './symbols/SpineSymbol.js';
export { PerspectiveCell, textureCellInset, canProjectTexture } from './symbols/PerspectiveCell.js';
export { SymbolRegistry } from './symbols/SymbolRegistry.js';
export { EmptySymbol } from './symbols/EmptySymbol.js';

// Snapshot spin (spin on cached static / motion-blurred textures)
export { SpinTextureCache, prewarmSpinTextures } from './snapshot/SpinTextureCache.js';
export type {
  SpinTextureCacheOptions,
  MotionBlurOptions,
  SnapshotRenderer,
  PrewarmSpinTexturesOptions,
} from './snapshot/SpinTextureCache.js';
export { StaticSpinSymbol } from './snapshot/StaticSpinSymbol.js';

// A ready-made playing-card symbol: coloured tile, fitted glyph, glyph-only
// win pulse. Ships with the package so a prototype needs no art at all.
export { CardSymbol, CARD_DECK, WILD_CARD } from './symbols/CardSymbol.js';
export type { CardSymbolOptions } from './symbols/CardSymbol.js';
export type { StaticSpinSymbolOptions } from './snapshot/StaticSpinSymbol.js';

// Spin
// `SpinController` and `SpinControllerHooks` are internal wiring built by
// `ReelSet`. Consumers never construct one. Same shape as `ReelMotion` /
// `StopSequencer`, which were hidden in 1.0.0.
//
// The built-in phase CLASSES are exported so a custom phase can SUBCLASS one
// rather than reimplement it. Overriding a single hook of `StopPhase` is a
// very different job from writing a stop phase from scratch, and going
// through `PhaseFactory` used to force the latter. Register a subclass the
// usual way: `builder.phases(f => f.register('stop', class extends StopPhase { ... }))`.
//
// These are engine internals with an engine-internal contract. Their
// protected surface (`onEnter` / `onSkip` / `update`, and each phase's private
// staging) can change in a minor release, so a subclass may need to follow.
// Phase Config TYPES stay exported as stable shape descriptions.
export { ReelPhase } from './spin/phases/ReelPhase.js';
export { PhaseFactory } from './spin/phases/PhaseFactory.js';
export { StartPhase } from './spin/phases/StartPhase.js';
export { SpinPhase } from './spin/phases/SpinPhase.js';
export { StopPhase } from './spin/phases/StopPhase.js';
export { AnticipationPhase } from './spin/phases/AnticipationPhase.js';
export { AdjustPhase } from './spin/phases/AdjustPhase.js';
export { CascadeFallPhase } from './spin/phases/CascadeFallPhase.js';
export { CascadePlacePhase } from './spin/phases/CascadePlacePhase.js';
export { CascadeDropInPhase } from './spin/phases/CascadeDropInPhase.js';
// The two shapes `PhaseFactory.register` / `.registerFactory` accept. Needed
// to type a helper that registers phases on your behalf.
export type { PhaseConstructor, PhaseCreatorFn } from './spin/phases/PhaseFactory.js';
export type { StartPhaseConfig } from './spin/phases/StartPhase.js';
export type { SpinPhaseConfig } from './spin/phases/SpinPhase.js';
export type { StopPhaseConfig } from './spin/phases/StopPhase.js';
export type { AnticipationPhaseConfig } from './spin/phases/AnticipationPhase.js';
export type { AdjustPhaseConfig, PinOverlayTween } from './spin/phases/AdjustPhase.js';

// Anticipation recipes
export { anticipationForScatters } from './spin/anticipationRecipes.js';
export type { ScatterAnticipationOptions } from './spin/anticipationRecipes.js';

// Tumble cascade
export type { TumbleConfig, TumbleFallConfig, TumbleDropInConfig } from './cascade/TumbleConfig.js';
// Fill a partial `.tumble(...)` config out to the fully-specified shape the
// three cascade phase constructors take. Needed to SUBCLASS one of them:
// `registerFactory` has to forward the same resolved config the builder would
// have passed, and hand-writing every field is how a subclass silently drifts
// from the set's actual tumble settings.
export { resolveTumbleConfig } from './cascade/TumbleConfig.js';
export type { ResolvedTumbleConfig } from './cascade/TumbleConfig.js';
export type { Cell, DropOffset } from './cascade/tumbleAlgorithm.js';
export { computeDropOffsets } from './cascade/tumbleAlgorithm.js';
export type { CascadeFallPhaseConfig } from './spin/phases/CascadeFallPhase.js';
export type { CascadePlacePhaseConfig } from './spin/phases/CascadePlacePhase.js';
export type { CascadeDropInPhaseConfig } from './spin/phases/CascadeDropInPhase.js';

// Spinning modes
export type { SpinningMode } from './spin/modes/SpinningMode.js';
export { StandardMode } from './spin/modes/StandardMode.js';
export { CascadeMode } from './spin/modes/CascadeMode.js';
export { ImmediateMode } from './spin/modes/ImmediateMode.js';

// Speed
export { SpeedManager } from './speed/SpeedManager.js';

// Frame
export { FrameBuilder } from './frame/FrameBuilder.js';
export type { FrameContext, FrameMiddleware } from './frame/FrameBuilder.js';
export type { ColumnTarget } from './frame/ColumnTarget.js';
export type {
  RandomSymbolControl,
  SymbolPool,
  SymbolPoolScope,
  SymbolPoolSlots,
} from './frame/SymbolPool.js';
export {
  cloneColumnTarget,
  columnTargetToStrip,
  getTargetSlot,
  setTargetSlot,
} from './frame/ColumnTarget.js';

// The v1 -> v2 rename table is deliberately NOT exported. It is 1.x
// migration scaffolding: the builder's fail-loud guards read it internally
// and every throw already names the replacement, so nothing a consumer
// writes needs the table itself. Exporting it would semver-lock migration
// state into all of 2.x. The guards go in 3.0; see ADR 016 section 6.2.

// Pool
export { ObjectPool } from './pool/ObjectPool.js';

// Spotlight
export { SymbolSpotlight } from './spotlight/SymbolSpotlight.js';
export type { SpotlightOptions, WinLine, CycleOptions } from './spotlight/SymbolSpotlight.js';

// Boards - a grid of independently spinning 1×1 cells.
//   BoardGrid is the generic mechanism (geometry, instances, spin a chosen
//   set of cells) - build your own feature on it. HoldAndWinBoard is the
//   opinionated lock / respin / collect layer, built entirely on BoardGrid's
//   public surface, so you can copy it and change the rules.
export { BoardGrid } from './board/BoardGrid.js';
export type { BoardCell, BoardSpinTarget, BoardProfile, BoardGridOptions } from './board/BoardGrid.js';
export { HoldAndWinBuilder } from './board/HoldAndWinBuilder.js';
export { HoldAndWinBoard } from './board/HoldAndWinBoard.js';
// The board's own constructor parameter. `HoldAndWinBuilder.build()` returns a
// board, so most consumers never name this - but the fork story below promises
// that everything a copied HoldAndWinBoard reaches for is public, and its
// constructor signature is the first thing a fork has to restate.
export type { HoldAndWinBoardConfig } from './board/HoldAndWinBoard.js';
// The pure reducer is public too: a fork copies HoldAndWinBoard + HoldAndWinState
// and repoints both imports at `pixi-reels` (see the comment below).
export { HoldAndWinState } from './board/HoldAndWinState.js';
export type { HwPhase } from './board/HoldAndWinState.js';
// `cellKey` and `HwEffect` round out the surface a forked board needs: copy
// HoldAndWinBoard + HoldAndWinState, repoint their imports at `pixi-reels`, and
// everything they reach for is public.
export { cellKey } from './board/HwTypes.js';
export type {
  HwCell,
  HwCoin,
  HwRespinReason,
  HwRespinResult,
  HoldAndWinBoardEvents,
  HwEffect,
  HwCellSizeOptions,
} from './board/HwTypes.js';

// Wins (symbol-highlight presenter. no line drawing, events-driven)
export { WinPresenter } from './wins/WinPresenter.js';
export type { WinPresenterOptions, WinSymbolAnim } from './wins/WinPresenter.js';
export { sortByValueDesc } from './wins/Win.js';

// Pins (cell persistence primitive)
export type {
  CellPin,
  CellPinOptions,
  PinExpireReason,
  PinMigration,
  CellCoord,
  MovePinOptions,
} from './pins/CellPin.js';
export { pinKey } from './pins/CellPin.js';

// ReelSet frame API (runtime middleware)
export type { FrameAPI } from './core/ReelSet.js';

// ReelSet cascade-API option types. exported so consumers can pass typed
// option objects around or extend them for engine-on-engine adapters.
export type {
  DestroySymbolsOptions,
  RefillOptions,
  RefillResult,
  RunCascadeOptions,
  RunCascadeResult,
} from './core/ReelSet.js';

// Events
export { EventEmitter } from './events/EventEmitter.js';
export type {
  ReelSetEvents,
  ReelEvents,
  SpinResult,
} from './events/ReelEvents.js';

// Utils
export type { Disposable } from './utils/Disposable.js';
export { TickerRef } from './utils/TickerRef.js';
export type { TickerCallback } from './utils/TickerRef.js';
export { driveGsapWithTicker } from './utils/gsapTicker.js';
// The gsap instance type. Public because it is the 2nd parameter of
// `driveGsapWithTicker`, the type of `ReelConfig.gsap`, and the return of
// the `Reel.gsap` accessor.
export type { Gsap } from './utils/gsap.js';

// Debug
export {
  debugSnapshot,
  debugGrid,
  enableDebug,
  startRecording,
  stopRecording,
  getFrames,
  clearFrames,
} from './debug/debug.js';
export type {
  DebugSnapshot,
  DebugReelSnapshot,
  RecordedFrame,
  StartRecordingOptions,
} from './debug/debug.js';
export { debugOverlay, OVERLAY_LABEL } from './debug/debugOverlay.js';
export type {
  DebugOverlayLayer,
  DebugOverlayOptions,
  DebugOverlayHandle,
  DebugOverlaySnapshot,
  DebugOverlayReelInfo,
} from './debug/debugOverlay.js';

// Testing utilities ship at the `pixi-reels/testing` subpath. Importing
// from there keeps the headless harness out of production bundles even
// when the consumer's tree-shaker can't prove it's dead code.
