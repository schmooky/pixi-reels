/**
 * A claim on a grid cell.
 *
 * A `CellPin` occupies a `{col, row}` position on the reel grid. It is
 * applied as a forced stop target when `setResult()` is called, so the
 * reel lands on the pinned symbol regardless of what the server sent for
 * that cell. It persists across spins according to its `turns` field.
 *
 * Pins unify every "stays put" mechanic in the library:
 *
 * - Sticky wild        → `pin(col, row, 'wild', { turns: 3 })`
 * - Expanding wild     → `pin(col, row, 'wild', { turns: 'eval' })`
 * - Hold & Win coin    → `pin(col, row, 'coin', { turns: 'permanent', payload: { value: 50 } })`
 * - Multiplier wild    → `pin(col, row, 'wild', { turns: 'permanent', payload: { multiplier: 3 } })`
 * - Sticky-win respin  → `pin(col, row, symbolId, { turns: respinsLeft })`
 *
 * Movement (walking wild, trailing wild) is done via `reelSet.movePin()`
 * in a separate slice; state-only pins ship first.
 */
export interface CellPin {
  /** Column (reel index) this pin is anchored to. */
  readonly col: number;
  /** Row (0 = top visible row) this pin is anchored to. */
  readonly row: number;
  /** Symbol id this pin forces onto its cell. */
  readonly symbolId: string;
  /**
   * Original row at pin creation. Frozen for the pin's lifetime.
   *
   * Megaways: when AdjustPhase reshapes the reel, the pin's row migrates
   * back toward `originRow` if it now fits (`min(originRow, newRows-1)`).
   * Prevents wander: a pin at `originRow=3` that gets clamped to row 2 on
   * a 3-row shape returns to row 3 on a later 5-row shape.
   *
   * Non-Megaways: equals `row` and never changes.
   */
  readonly originRow: number;
  /**
   * Lifetime of the pin:
   * - number      → counts down after each completed spin; removed at 0
   * - 'eval'      → valid for one spin only; cleared at the next spin start
   * - 'permanent' → persists until `unpin()` is called explicitly
   */
  readonly turns: number | 'eval' | 'permanent';
  /** Optional per-instance data: multiplier, value, tier — game-specific. */
  payload?: Readonly<Record<string, unknown>>;
}

/** Options accepted by `reelSet.pin()`. */
export interface CellPinOptions {
  /** Defaults to 'permanent'. */
  turns?: number | 'eval' | 'permanent';
  /** Arbitrary per-instance data. */
  payload?: Record<string, unknown>;
  /**
   * Original row for Megaways pin migration. Defaults to the row at pin
   * placement. The pin's `row` field migrates back toward this value when
   * the shape grows enough to fit it.
   */
  originRow?: number;
}

/** Reason a pin expired. Fired with `pin:expired`. */
export type PinExpireReason = 'turns' | 'explicit' | 'eval';

/** A grid coordinate. */
export interface CellCoord {
  col: number;
  row: number;
}

/** Options for `reelSet.movePin()` — flight animation tuning + lifecycle hooks. */
export interface MovePinOptions {
  /** Animation duration in milliseconds. Default 400. */
  duration?: number;
  /** GSAP easing string. Default 'power2.inOut'. */
  easing?: string;
  /**
   * Symbol id to use as the filler at the vacated cell. When omitted, the
   * engine picks a random symbol from its frame builder's random provider.
   */
  backfill?: string;
  /**
   * Fires after the flight symbol is acquired, positioned at `from`, and
   * added to the viewport — but before the tween begins. Use this hook to
   * drive animation state on the flight instance. For example: cast to
   * your `SpineSymbol` subclass and switch to a `run` animation for the
   * duration of the flight.
   *
   * `flight` is the pooled `ReelSymbol` instance. The type is `unknown` so
   * this module stays free of circular imports; cast in the caller.
   */
  onFlightCreated?: (flight: unknown) => void;
  /**
   * Fires after the tween completes, before the flight symbol is released
   * back to the pool. Use this hook to play a landing animation or return
   * a Spine symbol to `idle` before its instance is recycled.
   */
  onFlightCompleted?: (flight: unknown) => void;
}

/** Map key used internally and exposed by `reelSet.pins`. */
export function pinKey(col: number, row: number): string {
  return `${col}:${row}`;
}
