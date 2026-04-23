import type {
  SpeedProfile,
  Payline,
  ClusterWin,
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
   * WinPresenter started a sequence. Fires once per `show()` call. The
   * payload is the mixed list of wins — paylines and/or clusters — in
   * the order the presenter will show them (sorted by `value` desc by
   * default). Use `isPayline` / `isCluster` to narrow.
   */
  'win:start': [wins: readonly Win[]];
  /**
   * A single payline is now being presented. Fires once per payline per
   * cycle. `cells` is the payline expanded via `paylineToCells`. For
   * cluster-shaped wins, listen to `win:cluster` instead.
   */
  'win:line': [payline: Payline, cells: readonly SymbolPosition[]];
  /**
   * A single cluster is now being presented. Fires once per cluster per
   * cycle, analogous to `win:line` but for `ClusterWin`s (cascade pops,
   * cluster-pay hits, scatter splashes).
   */
  'win:cluster': [cluster: ClusterWin, cells: readonly SymbolPosition[]];
  /**
   * A specific winning cell is being animated. Fires once per cell per
   * win per cycle, for both paylines and clusters. `symbol` is typed as
   * `unknown` to keep this module free of symbol-layer imports; cast to
   * `ReelSymbol` (or your subclass). `win` is the owning payline /
   * cluster — narrow with `isPayline` / `isCluster`.
   */
  'win:symbol': [symbol: unknown, cell: SymbolPosition, win: Win];
  /** WinPresenter finished — either naturally (`complete`) or via abort. */
  'win:end': [reason: 'complete' | 'aborted'];
  'pin:placed': [pin: CellPin];
  'pin:moved': [pin: CellPin, from: { col: number; row: number }];
  'pin:expired': [pin: CellPin, reason: PinExpireReason];
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
