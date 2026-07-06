// Core
export { ReelSet } from './core/ReelSet.ts';
export { ReelSetBuilder } from './core/ReelSetBuilder.ts';
export { Reel } from './core/Reel.ts';
export type { ReelConfig, NudgeOptions } from './core/Reel.ts';
export { ReelViewport } from './core/ReelViewport.ts';

// Config
export { SpeedPresets } from './config/SpeedPresets.ts';
export { DEFAULTS } from './config/defaults.ts';
export type {
  SpeedProfile,
  SpinOptions,
  SymbolData,
  ReelGridConfig,
  ReelExtraSymbols,
  TrapezoidConfig,
  NoOffsetConfig,
  OffsetConfig,
  OffsetXMode,
  Matrix,
  Position,
  CellBounds,
  SymbolPosition,
  Win,
  MaskConfig,
  MultiWaysConfig,
  ReelAnchor,
} from './config/types.ts';
export type { ReelMaskRect, MaskStrategy } from './core/ReelViewport.ts';
export { RectMaskStrategy, SharedRectMaskStrategy } from './core/ReelViewport.ts';

// Symbols
export { ReelSymbol } from './symbols/ReelSymbol.ts';
export { SpriteSymbol } from './symbols/SpriteSymbol.ts';
export type { SpriteSymbolOptions } from './symbols/SpriteSymbol.ts';
export { AnimatedSpriteSymbol } from './symbols/AnimatedSpriteSymbol.ts';
export type { AnimatedSpriteSymbolOptions } from './symbols/AnimatedSpriteSymbol.ts';
export { SpineSymbol, whenSpineReady } from './symbols/SpineSymbol.ts';
export type { SpineSymbolOptions } from './symbols/SpineSymbol.ts';
export { SymbolRegistry } from './symbols/SymbolRegistry.ts';
export { EmptySymbol } from './symbols/EmptySymbol.ts';

// Spin
// `SpinController` and `SpinControllerHooks` are internal wiring built by
// `ReelSet`. Consumers never construct one. Same shape as `ReelMotion` /
// `StopSequencer`, which were hidden in 1.0.0.
//
// The built-in phase CLASSES (StartPhase, SpinPhase, StopPhase, etc.) are
// also internal. Consumers register custom phases via
// `builder.phases(f => f.register('name', class extends ReelPhase { ... }))`,
// they do not subclass the built-ins. Phase Config TYPES stay exported as
// stable shape descriptions for documentation.
export { ReelPhase } from './spin/phases/ReelPhase.ts';
export { PhaseFactory } from './spin/phases/PhaseFactory.ts';
export type { StartPhaseConfig } from './spin/phases/StartPhase.ts';
export type { SpinPhaseConfig } from './spin/phases/SpinPhase.ts';
export type { StopPhaseConfig } from './spin/phases/StopPhase.ts';
export type { AnticipationPhaseConfig } from './spin/phases/AnticipationPhase.ts';
export type { AdjustPhaseConfig } from './spin/phases/AdjustPhase.ts';

// Tumble cascade
export type { TumbleConfig, TumbleFallConfig, TumbleDropInConfig } from './cascade/TumbleConfig.ts';
export type { Cell, DropOffset } from './cascade/tumbleAlgorithm.ts';
export { computeDropOffsets } from './cascade/tumbleAlgorithm.ts';
export type { CascadeFallPhaseConfig } from './spin/phases/CascadeFallPhase.ts';
export type { CascadePlacePhaseConfig } from './spin/phases/CascadePlacePhase.ts';
export type { CascadeDropInPhaseConfig } from './spin/phases/CascadeDropInPhase.ts';

// Spinning modes
export type { SpinningMode } from './spin/modes/SpinningMode.ts';
export { StandardMode } from './spin/modes/StandardMode.ts';
export { CascadeMode } from './spin/modes/CascadeMode.ts';
export { ImmediateMode } from './spin/modes/ImmediateMode.ts';

// Speed
export { SpeedManager } from './speed/SpeedManager.ts';

// Frame
export { FrameBuilder } from './frame/FrameBuilder.ts';
export type { FrameContext, FrameMiddleware } from './frame/FrameBuilder.ts';
export type { ColumnTarget } from './frame/ColumnTarget.ts';

// Pool
export { ObjectPool } from './pool/ObjectPool.ts';

// Spotlight
export { SymbolSpotlight } from './spotlight/SymbolSpotlight.ts';
export type { SpotlightOptions, WinLine, CycleOptions } from './spotlight/SymbolSpotlight.ts';

// Boards — a grid of independently spinning 1×1 cells.
//   BoardGrid is the generic mechanism (geometry, instances, spin a chosen
//   set of cells) — build your own feature on it. HoldAndWinBoard is the
//   opinionated lock / respin / collect layer, built entirely on BoardGrid's
//   public surface, so you can copy it and change the rules.
export { BoardGrid } from './board/BoardGrid.ts';
export type { BoardCell, BoardSpinTarget, BoardProfile, BoardGridOptions } from './board/BoardGrid.ts';
export { HoldAndWinBuilder } from './board/HoldAndWinBuilder.ts';
export { HoldAndWinBoard } from './board/HoldAndWinBoard.ts';
// The pure reducer is public too: a fork copies HoldAndWinBoard + HoldAndWinState
// and repoints both imports at `pixi-reels` (see the comment below).
export { HoldAndWinState } from './board/HoldAndWinState.ts';
export type { HwPhase } from './board/HoldAndWinState.ts';
// `cellKey` and `HwEffect` round out the surface a forked board needs: copy
// HoldAndWinBoard + HoldAndWinState, repoint their imports at `pixi-reels`, and
// everything they reach for is public.
export { cellKey } from './board/HwTypes.ts';
export type {
  HwCell,
  HwCoin,
  HwRespinReason,
  HwRespinResult,
  HoldAndWinBoardEvents,
  HwEffect,
  HwCellSizeOptions,
} from './board/HwTypes.ts';

// Horizontal reel — a single sideways-scrolling strip (the "these symbols pay
// this round" banner above the reels). Not a matrix, not a spin lifecycle; its
// own small mechanism on the shared pool / ticker / event primitives.
export { HorizontalReel } from './horizontal/HorizontalReel.ts';
export { HorizontalReelBuilder } from './horizontal/HorizontalReelBuilder.ts';
export type {
  HorizontalDirection,
  HorizontalCascadeTiming,
  HorizontalReelConfig,
  HorizontalReelEvents,
} from './horizontal/HorizontalReelTypes.ts';

// Wins (symbol-highlight presenter. no line drawing, events-driven)
export { WinPresenter } from './wins/WinPresenter.ts';
export type { WinPresenterOptions, WinSymbolAnim } from './wins/WinPresenter.ts';
export { sortByValueDesc } from './wins/Win.ts';

// Pins (cell persistence primitive)
export type {
  CellPin,
  CellPinOptions,
  PinExpireReason,
  PinMigration,
  CellCoord,
  MovePinOptions,
} from './pins/CellPin.ts';
export { pinKey } from './pins/CellPin.ts';

// ReelSet frame API (runtime middleware)
export type { FrameAPI } from './core/ReelSet.ts';

// ReelSet cascade-API option types. exported so consumers can pass typed
// option objects around or extend them for engine-on-engine adapters.
export type {
  DestroySymbolsOptions,
  RefillOptions,
  RefillResult,
  RunCascadeOptions,
  RunCascadeResult,
} from './core/ReelSet.ts';

// Events
export { EventEmitter } from './events/EventEmitter.ts';
export type {
  ReelSetEvents,
  ReelEvents,
  SpinResult,
} from './events/ReelEvents.ts';

// Utils
export type { Disposable } from './utils/Disposable.ts';
export { TickerRef } from './utils/TickerRef.ts';
export { driveGsapWithTicker } from './utils/gsapTicker.ts';

// Debug
export {
  debugSnapshot,
  debugGrid,
  enableDebug,
  startRecording,
  stopRecording,
  getFrames,
  clearFrames,
} from './debug/debug.ts';
export type {
  DebugSnapshot,
  DebugReelSnapshot,
  RecordedFrame,
  StartRecordingOptions,
} from './debug/debug.ts';

// Testing utilities ship at the `pixi-reels/testing` subpath. Importing
// from there keeps the headless harness out of production bundles even
// when the consumer's tree-shaker can't prove it's dead code.
