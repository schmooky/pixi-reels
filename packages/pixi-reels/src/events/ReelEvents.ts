import type {
  SpeedProfile,
  Win,
  SymbolPosition,
} from '../config/types.js';
import type { CellPin, PinExpireReason } from '../pins/CellPin.js';

// Re-export SymbolPosition (lives in config/types) so existing imports
// from this module keep working.
export type { SymbolPosition };

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
  /**
   * WinPresenter started a sequence. Fires once per `show()` call, with
   * the full list of wins in the order they'll be shown (sorted by
   * `value` desc by default).
   */
  'win:start': [wins: readonly Win[]];
  /**
   * A single win is now being presented. Fires once per win per cycle —
   * before `win:symbol` fires for its cells. Subscribe to draw per-win
   * visuals (payline polyline, cluster outline, number popup) using
   * `reelSet.getCellBounds(col, row)`.
   */
  'win:group': [win: Win, cells: readonly SymbolPosition[]];
  /**
   * A specific cell is being animated. Fires once per cell per win per
   * cycle. `symbol` is typed as `unknown` to keep this module free of
   * symbol-layer imports; cast to `ReelSymbol` (or your subclass).
   * When `WinPresenter.stagger > 0`, successive cells fire this event
   * one after another with that gap.
   */
  'win:symbol': [symbol: unknown, cell: SymbolPosition, win: Win];
  /** WinPresenter finished — either naturally (`complete`) or via abort. */
  'win:end': [reason: 'complete' | 'aborted'];
  /**
   * A pin was placed at a cell. The pin's `originRow` is captured at
   * placement and frozen for its lifetime; on MultiWays slots it controls
   * how the pin migrates across reshapes (see `pin:migrated`). For
   * non-MultiWays slots `originRow === pin.row` and never changes — but
   * the field is still on the payload, so trace logs can show the intent.
   */
  'pin:placed': [pin: CellPin];
  'pin:moved': [pin: CellPin, from: { col: number; row: number }];
  'pin:expired': [pin: CellPin, reason: PinExpireReason];
  /**
   * MultiWays: a pin was relocated by an AdjustPhase reshape because its
   * `originRow` either no longer fits within the new shape (`clamped: true`)
   * or fits at a row that differs from its current visual position.
   *
   * Always fires from a MultiWays AdjustPhase — non-MultiWays slots never
   * emit this event.
   */
  'pin:migrated': [
    pin: CellPin,
    info: { fromRow: number; toRow: number; clamped: boolean; reelIndex: number },
  ];
  /**
   * MultiWays: `setShape(rowsPerReel)` recorded a new target shape for the
   * upcoming AdjustPhase. Fires before any geometry change. No-op for
   * non-MultiWays slots — they never see this event.
   */
  'shape:changed': [rowsPerReel: number[]];
  /**
   * MultiWays: per-reel AdjustPhase entry. `fromRows` is the row count
   * before the reshape; `toRows` is the row count after.
   */
  'adjust:start': [info: { reelIndex: number; fromRows: number; toRows: number }];
  /** MultiWays: per-reel AdjustPhase exit. */
  'adjust:complete': [info: { reelIndex: number }];
  /**
   * Fires whenever the engine creates a visual overlay symbol for a pin
   * during a spin's motion phase. The `overlay` argument is the pooled
   * ReelSymbol instance — typed as `unknown` here to keep this module
   * free of symbol-layer imports; cast to your concrete symbol class.
   *
   * Use this hook to drive animation state on the overlay (e.g. set a
   * Spine animation track). The overlay is recycled on `pin:overlayDestroyed`.
   */
  'pin:overlayCreated': [pin: CellPin, overlay: unknown];
  /**
   * Fires when the engine is about to release a pin's visual overlay
   * back to the pool (on spin:allLanded, unpin, or pin replacement).
   * Use this hook to stop any animations or listeners you attached.
   */
  'pin:overlayDestroyed': [pin: CellPin, overlay: unknown];
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
