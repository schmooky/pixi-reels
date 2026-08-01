/**
 * A claim on a grid cell.
 *
 * A `CellPin` occupies a `{reel, cell}` position on the reel grid. It is
 * applied as a forced stop target when `setResult()` is called, so the
 * reel lands on the pinned symbol regardless of what the server sent for
 * that cell. It persists across spins according to its `turns` field.
 *
 * Pins unify every "stays put" mechanic in the library:
 *
 * - Sticky wild        → `pin(reel, cell, 'wild', { turns: 3 })`
 * - Expanding wild     → `pin(reel, cell, 'wild', { turns: 'eval' })`
 * - Hold & Win coin    → `pin(reel, cell, 'coin', { turns: 'permanent', payload: { value: 50 } })`
 * - Multiplier wild    → `pin(reel, cell, 'wild', { turns: 'permanent', payload: { multiplier: 3 } })`
 * - Sticky-win respin  → `pin(reel, cell, symbolId, { turns: respinsLeft })`
 *
 * Movement (walking wild, trailing wild) is done via `reelSet.movePin()`
 * in a separate slice; state-only pins ship first.
 */
/**
 * How a pin behaves when a MultiWays reshape changes the cell count of its
 * reel. Non-MultiWays slots never reshape, so this value is irrelevant
 * there.
 *
 * - **`'origin'`** (default). the pin migrates to `min(originCell, newCells - 1)`
 *   on every reshape. Clamps when the shape is too small; **restores to
 *   the origin** when the shape grows back. Prevents wander. a pin at
 *   `originCell=3` clamped to cell 2 on a 3-cell shape returns to cell 3 on
 *   a later 5-cell shape. The right default for sticky wilds, trailing
 *   wilds, and any "this position has meaning" mechanic.
 *
 * - **`'frozen'`**. the pin stays at its current cell if the new shape
 *   fits, otherwise clamps to the last visible cell AND **updates
 *   `originCell` to the clamped position** so it never restores. Use when
 *   the pin's cell should be locked to wherever it is now, regardless of
 *   future shape changes (e.g. a walking-wild on MultiWays where the
 *   wild's "current cell" IS the source of truth. restoring to a
 *   pre-walk cell would undo the walk).
 */
export type PinMigration = 'origin' | 'frozen';

export interface CellPin {
  /** Column (reel index) this pin is anchored to. */
  readonly reel: number;
  /** Row (0 = top visible cell) this pin is anchored to. */
  readonly cell: number;
  /** Symbol id this pin forces onto its cell. */
  readonly symbolId: string;
  /**
   * Original cell at pin creation. The pin migrates back toward this value
   * across MultiWays reshapes when `migration === 'origin'` (the default).
   * For `migration === 'frozen'` this is updated on every clamp so the
   * pin never restores to a higher cell.
   *
   * Non-MultiWays: equals `cell` and never changes.
   */
  readonly originCell: number;
  /**
   * Migration policy across MultiWays reshapes. Default `'origin'`.
   * see {@link PinMigration} for semantics.
   */
  readonly migration: PinMigration;
  /**
   * Lifetime of the pin:
   * - number      → counts down after each completed spin; removed at 0
   * - 'eval'      → valid for one spin only; cleared at the next spin start
   * - 'permanent' → persists until `unpin()` is called explicitly
   */
  readonly turns: number | 'eval' | 'permanent';
  /** Optional per-instance data: multiplier, value, tier. game-specific. */
  payload?: Readonly<Record<string, unknown>>;
}

/**
 * Options accepted by `reelSet.pin()`.
 *
 * **Calling `pin()` mid-reshape** (from a `shape:changed`, `pin:migrated`, or
 * `adjust:start` event handler) is allowed and well-defined: the new pin is
 * placed at the cell you pass, and `originCell` defaults to the **post-reshape**
 * cell (i.e. whatever `cell` is *now*, on the new shape). If you want the pin
 * to remember a different origin, pass `originCell` explicitly. The pin
 * participates in the next migration cycle like any other pin.
 */
export interface CellPinOptions {
  /** Defaults to 'permanent'. */
  turns?: number | 'eval' | 'permanent';
  /** Arbitrary per-instance data. */
  payload?: Record<string, unknown>;
  /**
   * Original cell for MultiWays pin migration. Defaults to the cell at pin
   * placement. With `migration === 'origin'` (default), the pin's `cell`
   * migrates back toward this value when the shape grows enough to fit
   * it; with `migration === 'frozen'` this gets overwritten on every
   * clamp so the pin doesn't restore.
   */
  originCell?: number;
  /**
   * MultiWays migration policy. Default `'origin'`. clamp + restore.
   * Set to `'frozen'` for "lock at current cell, never restore" semantics.
   * See {@link PinMigration}.
   */
  migration?: PinMigration;
}

/**
 * Reason a pin expired. Fired with `pin:expired`.
 *   - `'turns'`     - its turn counter reached zero.
 *   - `'explicit'`  - removed via `unpin()`.
 *   - `'eval'`      - an eval callback returned false.
 *   - `'collision'` - a reshape clamped it onto a cell another pin already
 *                     holds, so it was dropped deterministically.
 */
export type PinExpireReason = 'turns' | 'explicit' | 'eval' | 'collision';

/** A grid coordinate. */
export interface CellCoord {
  reel: number;
  cell: number;
}

/** Options for `reelSet.movePin()`. flight animation tuning + lifecycle hooks. */
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
   * added to the viewport. but before the tween begins. Use this hook to
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
export function pinKey(reel: number, cell: number): string {
  return `${reel}:${cell}`;
}
