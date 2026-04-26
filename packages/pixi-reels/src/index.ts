// Core
export { ReelSet } from './core/ReelSet.js';
export { ReelSetBuilder } from './core/ReelSetBuilder.js';
export { Reel, OCCUPIED_SENTINEL } from './core/Reel.js';
export type { ReelConfig } from './core/Reel.js';
export { ReelViewport } from './core/ReelViewport.js';
export { ReelMotion } from './core/ReelMotion.js';
export { StopSequencer } from './core/StopSequencer.js';

// Config
export { SpeedPresets } from './config/SpeedPresets.js';
export { DEFAULTS } from './config/defaults.js';
export type {
  SpeedProfile,
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
  ReelSetInternalConfig,
  ResolvedReelGridConfig,
  MultiWaysConfig,
  ReelAnchor,
} from './config/types.js';
export type { ReelMaskRect, MaskStrategy } from './core/ReelViewport.js';
export { RectMaskStrategy } from './core/ReelViewport.js';

// Symbols
export { ReelSymbol } from './symbols/ReelSymbol.js';
export { SpriteSymbol } from './symbols/SpriteSymbol.js';
export type { SpriteSymbolOptions } from './symbols/SpriteSymbol.js';
export { AnimatedSpriteSymbol } from './symbols/AnimatedSpriteSymbol.js';
export type { AnimatedSpriteSymbolOptions } from './symbols/AnimatedSpriteSymbol.js';
export { SpineSymbol } from './symbols/SpineSymbol.js';
export type { SpineSymbolOptions } from './symbols/SpineSymbol.js';
export { SymbolRegistry } from './symbols/SymbolRegistry.js';
export { SymbolFactory } from './symbols/SymbolFactory.js';

// Spin
export { SpinController } from './spin/SpinController.js';
export type { SpinControllerHooks } from './spin/SpinController.js';
export { ReelPhase } from './spin/phases/ReelPhase.js';
export { PhaseFactory } from './spin/phases/PhaseFactory.js';
export { StartPhase } from './spin/phases/StartPhase.js';
export type { StartPhaseConfig } from './spin/phases/StartPhase.js';
export { SpinPhase } from './spin/phases/SpinPhase.js';
export type { SpinPhaseConfig } from './spin/phases/SpinPhase.js';
export { StopPhase } from './spin/phases/StopPhase.js';
export type { StopPhaseConfig } from './spin/phases/StopPhase.js';
export { AnticipationPhase } from './spin/phases/AnticipationPhase.js';
export type { AnticipationPhaseConfig } from './spin/phases/AnticipationPhase.js';
export { AdjustPhase } from './spin/phases/AdjustPhase.js';
export type { AdjustPhaseConfig, PinOverlayTween } from './spin/phases/AdjustPhase.js';

// Cascade drop-in
export { DropRecipes } from './cascade/DropRecipes.js';
export type { CascadeDropConfig } from './cascade/DropRecipes.js';
export { DropStartPhase } from './spin/phases/DropStartPhase.js';
export type { DropStartPhaseConfig } from './spin/phases/DropStartPhase.js';
export { DropStopPhase } from './spin/phases/DropStopPhase.js';
export type { DropStopPhaseConfig } from './spin/phases/DropStopPhase.js';
export { CascadeAnticipationPhase } from './cascade/CascadeAnticipationPhase.js';

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
export { RandomSymbolProvider } from './frame/RandomSymbolProvider.js';
export { OffsetCalculator } from './frame/OffsetCalculator.js';

// Pool
export { ObjectPool } from './pool/ObjectPool.js';

// Spotlight
export { SymbolSpotlight } from './spotlight/SymbolSpotlight.js';
export type { SpotlightOptions, WinLine, CycleOptions } from './spotlight/SymbolSpotlight.js';

// Wins (symbol-highlight presenter — no line drawing, events-driven)
export { WinPresenter } from './wins/WinPresenter.js';
export type { WinPresenterOptions, WinSymbolAnim } from './wins/WinPresenter.js';
export { sortByValueDesc } from './wins/Win.js';

// Pins (cell persistence primitive)
export type {
  CellPin,
  CellPinOptions,
  PinExpireReason,
  CellCoord,
  MovePinOptions,
} from './pins/CellPin.js';
export { pinKey } from './pins/CellPin.js';

// ReelSet frame API (runtime middleware)
export type { FrameAPI } from './core/ReelSet.js';

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

// Debug
export { debugSnapshot, debugGrid, enableDebug } from './debug/debug.js';
export type { DebugSnapshot, DebugReelSnapshot } from './debug/debug.js';

// Testing utilities (tree-shakeable)
export {
  FakeTicker,
  HeadlessSymbol,
  createTestReelSet,
  spinAndLand,
  captureEvents,
  expectGrid,
  countSymbol,
} from './testing/index.js';
export type { TestReelSetOptions, TestReelSetHandle } from './testing/index.js';
