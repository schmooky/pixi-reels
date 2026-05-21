import type { Container } from 'pixi.js';
import type {
  SpeedProfile,
  Win,
  SymbolPosition,
} from '../config/types.js';
import type { CellPin, PinExpireReason } from '../pins/CellPin.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';

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

/**
 * Summary returned by `reelSet.runCascade(...)`. Defined here (rather than
 * in `core/ReelSet.ts`) so the public events module owns the shape;
 * `core/ReelSet.ts` re-exports the type under the same name.
 */
export interface RunCascadeResult {
  /** Number of refill stages that actually ran (0 = the initial grid had no wins). */
  chainLength: number;
  /** Sum of `winners.length` across every refill stage. */
  totalWinners: number;
  /** Grid after the last refill (or the input grid if `chainLength === 0`). */
  finalGrid: string[][];
  /** True when the chain ended early because the player slammed mid-cascade. */
  wasSkipped: boolean;
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
  /**
   * Round-aware `skip()` first-press boost: in standard (non-cascade)
   * mode, the engine switched the active speed profile to the fastest
   * registered one for the rest of this round. Fires once per round on
   * the first `skip()` press only, alongside the slam — never on
   * subsequent presses, never on `slamStop()` or `requestSkip()`, and
   * never in cascade mode (which auto-slams refills instead of boosting
   * speed). The round-end restore on the next `spin()` does not fire
   * this event; listen to `speed:changed` if you need that signal.
   */
  'skip:boosted': [info: { previous: SpeedProfile; current: SpeedProfile }];
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
   * Tumble cascade: this reel's fall-out animation just started. Fires once
   * per reel per `spin()` (never on `refill()` — refill skips the fall).
   */
  'cascade:fall:start': [info: { reelIndex: number }];
  /**
   * Tumble cascade: about to animate one symbol's fall-out. Fires once per
   * visible symbol per `cascade:fall:start`, right BEFORE the GSAP tween
   * begins — listeners can start parallel tweens on any other view property
   * (scale, alpha, badge text, spine track) and they'll run in sync with
   * the library's `view.y` animation.
   *
   *   - `symbol` — the `ReelSymbol` about to fall (current id, current view)
   *   - `view` — the symbol's PixiJS container (same as `symbol.view`)
   *   - `duration`, `ease`, `distance` — what the library will animate
   *   - `signal` — aborts when the fall is skipped / slammed. Register a
   *     one-shot `signal.addEventListener('abort', cleanup, { once: true })`
   *     to kill any parallel tweens or `gsap.delayedCall` handles your
   *     listener started, so a slam-stop doesn't leave squish / bounce
   *     timers firing after the library has snapped the view to its
   *     final position.
   */
  'cascade:fall:symbol': [info: {
    symbol: ReelSymbol;
    view: Container;
    reelIndex: number;
    rowIndex: number;
    duration: number;
    ease: string;
    distance: number;
    signal: AbortSignal;
  }];
  /** Tumble cascade: this reel's fall-out animation finished. */
  'cascade:fall:end': [info: { reelIndex: number }];
  /**
   * Tumble cascade: new symbol identities just landed in the reel buffer.
   * Fires AFTER `placeSymbols` snaps everything to grid, BEFORE the drop-in
   * tween starts — the canonical spot to apply per-symbol decorations
   * (multiplier badges, sticky markers) so they fall WITH the symbol.
   *
   * `cascade:place` is a single-moment placement (no animation), so it has
   * no `:start` counterpart — only this `:end`.
   *
   *   - `isInitial: true` on Moment A (after a `spin()` click). Every visible
   *     row is "new" — `winnerRows` is `[]` because there's no prior grid.
   *   - `isInitial: false` on Moment B (a `refill()`). `winnerRows` lists the
   *     row indices whose old symbols were cleared by the win; rows in that
   *     set are new arrivals, the rest are survivors sliding down to fill
   *     holes. Pair with `computeDropOffsets` (or just walk `winnerRows`
   *     yourself) if you need to decorate only new arrivals.
   */
  'cascade:place:end': [info: {
    reelIndex: number;
    placedSymbols: readonly ReelSymbol[];
    isInitial: boolean;
    winnerRows: readonly number[];
  }];
  /** Tumble cascade: this reel's drop-in animation just started. */
  'cascade:dropIn:start': [info: { reelIndex: number }];
  /**
   * Tumble cascade: about to animate one symbol's drop-in. Same contract as
   * `cascade:fall:symbol` — fires right BEFORE the tween, listeners may
   * start parallel tweens. `offsetRows` is the number of cells this symbol
   * will traverse (1 for top-row refills, more for survivors sliding past
   * larger holes).
   *
   * `signal` aborts when the drop-in is skipped / slammed. Use it to kill
   * parallel tweens or `gsap.delayedCall` handles (landing squish, bounce,
   * badge animations) so a slam-stop doesn't leave timers firing after
   * the library has snapped the view to its grid position.
   */
  'cascade:dropIn:symbol': [info: {
    symbol: ReelSymbol;
    view: Container;
    reelIndex: number;
    rowIndex: number;
    duration: number;
    ease: string;
    offsetRows: number;
    signal: AbortSignal;
  }];
  /** Tumble cascade: this reel's drop-in animation finished. */
  'cascade:dropIn:end': [info: { reelIndex: number }];
  /**
   * Tumble cascade — two-stage refill only: this reel's GRAVITY stage just
   * started. Gravity = surviving symbols sliding down to fill the holes the
   * winners left behind, without any new symbols entering yet. New symbols
   * stay hidden above the viewport until `cascade:dropIn:start` fires later
   * in the same refill (after `gravityHoldMs`).
   *
   * NEVER fires in the default `mode: 'combined'` refill — only when the
   * caller opts into `mode: 'gravity-then-drop'` on `refill()` /
   * `runCascade({ refillMode: ... })`.
   */
  'cascade:gravity:start': [info: { reelIndex: number }];
  /**
   * Tumble cascade — two-stage refill only: about to animate one survivor
   * sliding down. Same contract as `cascade:dropIn:symbol` but scoped to
   * survivors (no new symbols). `offsetRows` is how many cells this
   * survivor will slide down.
   *
   * Reels where no survivor moves (e.g. all winners landed at the top of
   * the column) skip this event entirely — the gravity stage has nothing
   * to animate there.
   */
  'cascade:gravity:symbol': [info: {
    symbol: ReelSymbol;
    view: Container;
    reelIndex: number;
    rowIndex: number;
    duration: number;
    ease: string;
    offsetRows: number;
    signal: AbortSignal;
  }];
  /**
   * Tumble cascade — two-stage refill only: this reel's gravity stage just
   * finished. Fires per-reel; the global hold (`gravityHoldMs`) begins
   * AFTER the slowest reel reports this event.
   */
  'cascade:gravity:end': [info: { reelIndex: number }];
  /**
   * Tumble cascade — two-stage refill only: a user-supplied gate
   * (`gravityHold` promise/factory or `onGravityComplete` callback)
   * rejected or threw. The engine logs the error to `console.error` and
   * slams the refill so the awaited `refill()` / `runCascade()` promise
   * still settles — but the original rejection reason would otherwise be
   * lost. Listen here to forward the error to your own logger / alarm /
   * error reporter.
   *
   *   - `error` — whatever the user-supplied promise rejected with (or
   *     `onGravityComplete` threw). Typed `unknown` because user code is
   *     free to throw anything.
   */
  'cascade:gravity:error': [info: { error: unknown }];
  /**
   * Tumble cascade: a single chain stage just started.
   *
   * Fired inside `runCascade(...)` after `detectWinners` returns a non-empty
   * list, BEFORE `destroySymbols` runs. The canonical place to cue
   * per-cascade SFX, light up a chain counter HUD, or freeze auto-play
   * controls for the duration of the stage. Pair with `cascade:chain:end`
   * for symmetric setup / teardown.
   *
   *   - `chain` — 1-indexed chain stage number (1 on the first refill,
   *     2 on the second, etc.).
   *   - `winners` — cells about to be destroyed this stage.
   *   - `currentGrid` — grid as it stands right now (pre-destroy).
   */
  'cascade:chain:start': [info: {
    chain: number;
    winners: readonly { reel: number; row: number }[];
    currentGrid: string[][];
  }];
  /**
   * Tumble cascade: a single chain stage just finished — both destroy AND
   * refill drop-in are done, and the chain is about to loop back to the
   * next `detectWinners` (or exit). The mirror of `cascade:chain:start`.
   *
   *   - `chain` — same 1-indexed chain stage number as `chain:start`.
   *   - `winners` — cells that were destroyed this stage.
   *   - `nextGrid` — the grid the next chain iteration will read.
   */
  'cascade:chain:end': [info: {
    chain: number;
    winners: readonly { reel: number; row: number }[];
    nextGrid: string[][];
  }];
  /**
   * Tumble cascade: `destroySymbols(cells, ...)` is about to start. Fires
   * once per call — both inside `runCascade` and when consumers call
   * `destroySymbols` directly. Empty cell lists do NOT emit this event
   * (the call returns immediately with no animation).
   *
   * Use this to cue a `destroy` SFX, dim a HUD, or capture the pre-destroy
   * grid for replay logging. Synchronous; the destroy tweens start right
   * after listeners return.
   */
  'cascade:destroy:start': [info: { cells: readonly { reel: number; row: number }[] }];
  /**
   * Tumble cascade: `destroySymbols(cells, ...)` just finished — every
   * cell's `playDestroy()` settled and the viewport dim (if any) was
   * restored. Mirror of `cascade:destroy:start`.
   *
   *   - `cells` — the cells the call was invoked with (same identity as
   *     the `start` payload).
   *   - `failed` — optional; present only when one or more
   *     `playDestroy()` promises rejected. The next `refill()` /
   *     `setResult()` resets these cells via `_replaceSymbol`, so the
   *     visible state recovers automatically — listen if you want to
   *     log / replay-mark / alarm on the rejection.
   */
  'cascade:destroy:end': [info: {
    cells: readonly { reel: number; row: number }[];
    failed?: readonly { reel: number; row: number }[];
  }];
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
  /**
   * A reel-at-rest nudge just began. Fires once per `reelSet.nudge(...)` call,
   * right before the GSAP tween starts. Listeners can cue SFX, dim a HUD, or
   * lock other inputs for the duration of the nudge.
   *
   * Nudges are always per-reel — multi-reel sync is via `Promise.all([...])`
   * of independent calls, each of which emits its own start/complete pair.
   *
   *   - `direction: 'down'` — symbols visually move down, new symbols enter
   *     from the top of the visible window.
   *   - `direction: 'up'` — opposite: symbols move up, new symbols enter
   *     from the bottom.
   */
  'nudge:start': [info: {
    reelIndex: number;
    distance: number;
    direction: 'up' | 'down';
  }];
  /**
   * A reel-at-rest nudge finished — the strip has snapped to its post-nudge
   * grid position. Mirror of `nudge:start`. `symbols` is the full new visible
   * column top-to-bottom (handy for win-detection re-runs).
   */
  'nudge:complete': [info: {
    reelIndex: number;
    distance: number;
    direction: 'up' | 'down';
    symbols: string[];
  }];
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
