import type { SpeedProfile } from '../config/types.js';
import type { CellPin, PinExpireReason } from '../pins/CellPin.js';

/** Position of a symbol on the reel grid. */
export interface SymbolPosition {
  reelIndex: number;
  rowIndex: number;
}

/** Result returned when a spin completes. */
export interface SpinResult {
  /** Final symbol grid [reelIndex][rowIndex]. */
  symbols: string[][];
  /** Whether the spin was skipped/slam-stopped. */
  wasSkipped: boolean;
  /** Total spin duration in milliseconds. */
  duration: number;
}

/** Events emitted by a ReelSet. */
export interface ReelSetEvents extends Record<string, unknown[]> {
  'spin:start': [];
  'spin:allStarted': [];
  'spin:stopping': [reelIndex: number];
  'spin:reelLanded': [reelIndex: number, symbols: string[]];
  'spin:allLanded': [result: SpinResult];
  'spin:complete': [result: SpinResult];
  'skip:requested': [];
  'skip:completed': [];
  'speed:changed': [profile: SpeedProfile, previous: SpeedProfile];
  'spotlight:start': [positions: SymbolPosition[]];
  'spotlight:end': [];
  'pin:placed': [pin: CellPin];
  'pin:moved': [pin: CellPin, from: { col: number; row: number }];
  'pin:expired': [pin: CellPin, reason: PinExpireReason];
  'destroyed': [];
}

/** Events emitted by an individual Reel. */
export interface ReelEvents extends Record<string, unknown[]> {
  'phase:enter': [phaseName: string];
  'phase:exit': [phaseName: string];
  'symbol:created': [symbolId: string, row: number];
  'symbol:recycled': [symbolId: string, row: number];
  'landed': [symbols: string[]];
  'destroyed': [];
}
