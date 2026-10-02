import type { AnticipationOptions, SymbolData } from '../config/types.js';
import type { SpinResult } from '../events/ReelEvents.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { getTargetSlot } from '../frame/ColumnTarget.js';

/** Options for {@link ReelSet.addReels}. */
export interface AddReelsOptions {
  /**
   * Visible cells of each new reel: one number for all of them, or one per
   * new reel. Default: the last reel's count (the set's `visibleCells` on a
   * uniform set). On a MultiWays set a reel is added at `maxCells`, the
   * spin-time geometry every reel shares, and a count here reshapes it at
   * once. A reel can never be taller than the set's tallest reel: that
   * would move every reel already on the board.
   */
  visibleCells?: number | readonly number[];
  /**
   * What the new reels show before their first spin, one `ColumnTarget` per
   * new reel. Default: random fill, like a set built without
   * `initialFrame()`.
   */
  initialFrame?: readonly ColumnTarget[];
}

/** One step of an {@link ReelSet.expand} chain: the reels it added. */
export interface ExpandStep {
  /** Step number within this `expand()` call, from `0`. */
  index: number;
  /** Index of the first reel this step added. */
  from: number;
  /** How many reels this step added: the `step` size, widened to fit any big symbol. */
  count: number;
  /** Reels on the board after this step. */
  reelCount: number;
  /**
   * `true` for the step that lands everything left after the expansion's
   * `signal` aborted. It spins and slams in the same tick.
   */
  fastForward: boolean;
}

/** An {@link ExpandStep} after its reels landed. */
export interface ExpandStepLanded extends ExpandStep {
  /** The step's spin result. `symbols` is the whole board. */
  result: SpinResult;
}

/** Options for {@link ReelSet.expand}. */
export interface ExpandOptions {
  /**
   * The result of every reel to add, in order, one `ColumnTarget` per reel.
   * Its length is how many reels the board grows by; the server decides it.
   * Each column's `visible.length` is that reel's cell count, so a MultiWays
   * set takes its per-reel shape from here and a jagged set its height.
   * Big symbols anchor in these columns like they do in `setResult()`; a
   * block may not reach back into the reels already on the board.
   */
  columns: readonly ColumnTarget[];
  /**
   * Reels added and spun per step. A number (default `1`), or a function of
   * the step for a pattern such as "two, then one at a time". A step is
   * widened, never split, when a big symbol anchored in it reaches past its
   * last reel: a 2-reel block in a 1-reel step makes that step add two.
   */
  step?: number | ((info: { index: number; from: number; remaining: number }) => number);
  /**
   * Called once a step's reels are on the board and before they spin, and
   * awaited: pan the camera to them here so the player sees them arrive.
   */
  onAdded?: (step: ExpandStep) => void | Promise<void>;
  /**
   * Called once a step's reels land, and awaited before the next step adds
   * any: count the ways, draw the win, decide what the next step shows.
   */
  onLanded?: (step: ExpandStepLanded) => void | Promise<void>;
  /**
   * Tease a step's reels before they land, with `setAnticipation()` on every
   * reel the step adds. `true` teases with the defaults (the speed profile's
   * `anticipationDelay` is the hold); an `AnticipationOptions` object is
   * passed through, so a step's tease can be staggered, curved or protected
   * from the first skip press (`{ protect: 'once' }`); a function decides
   * per step. The fast-forward step never teases.
   */
  anticipation?:
    | boolean
    | AnticipationOptions
    | ((step: ExpandStep) => boolean | AnticipationOptions);
  /** Spin mode of every step. Defaults to the set's default, as in `spin()`. */
  mode?: 'standard' | 'cascade';
  /**
   * Fast-forward. Aborting slams the step in flight, then adds every reel
   * still to come in one last step that lands in the same tick. The result
   * is the same board, just without the wait. `onAdded` / `onLanded` still
   * run for that step, with `fastForward: true`.
   */
  signal?: AbortSignal;
}

/** What {@link ReelSet.expand} resolves with. */
export interface ExpandResult {
  /** Reels on the board before the expansion. */
  from: number;
  /** Reels on the board after it. */
  reelCount: number;
  /** Steps it took, the fast-forward step included. */
  steps: number;
  /** The whole visible board after the last step, like `SpinResult.symbols`. */
  symbols: string[][];
  /** `true` if any step was skipped or slammed, or the expansion was aborted. */
  wasSkipped: boolean;
}

/**
 * Split an expansion into steps.
 *
 * Walks the new columns the way the big-symbol coordinator will, left to
 * right with later cells under an earlier block skipped, so a repeated anchor
 * id inside a block (what `getTargets()` replays) is not read as a second
 * block. Throws before anything moves when a block does not fit: past the
 * last new reel, or past the bottom of a reel's strip.
 *
 * @internal Exported for `ReelSet.expand()` and its tests.
 */
export function planExpandSteps(
  columns: readonly ColumnTarget[],
  step: ExpandOptions['step'],
  symbolsData: Readonly<Record<string, SymbolData>>,
  bufferStart: number,
  bufferEnd: number,
  from: number,
): number[] {
  const n = columns.length;
  // reach[c]: one past the last column a block anchored in column c covers.
  const reach = columns.map((_, c) => c + 1);
  const covered = new Set<string>();
  for (let c = 0; c < n; c++) {
    const cells = columns[c].visible.length;
    for (let row = -bufferStart; row < cells + bufferEnd; row++) {
      if (covered.has(`${c}:${row}`)) continue;
      const id = getTargetSlot(columns[c], row);
      const size = id === undefined ? undefined : symbolsData[id]?.size;
      if (!size || (size.reels === 1 && size.cells === 1)) continue;
      if (c + size.reels > n) {
        throw new Error(
          `expand(): big symbol '${id}' (${size.reels}x${size.cells}) anchored on new reel ` +
            `${from + c} reaches reel ${from + c + size.reels - 1}, past the last reel this ` +
            `expansion adds (${from + n - 1}). Send its whole block, or anchor it further left.`,
        );
      }
      for (let dx = 0; dx < size.reels; dx++) {
        const strip = columns[c + dx].visible.length + bufferEnd;
        if (row + size.cells > strip) {
          throw new Error(
            `expand(): big symbol '${id}' (${size.reels}x${size.cells}) at new reel ${from + c}, ` +
              `cell ${row} runs past the bottom of reel ${from + c + dx}'s strip ` +
              `(cell + ${size.cells} > visible ${columns[c + dx].visible.length} + bufferEnd ${bufferEnd}).`,
          );
        }
        for (let dy = 0; dy < size.cells; dy++) {
          if (dx !== 0 || dy !== 0) covered.add(`${c + dx}:${row + dy}`);
        }
      }
      reach[c] = Math.max(reach[c], c + size.reels);
    }
  }

  const plan: number[] = [];
  for (let k = 0; k < n; ) {
    const asked = typeof step === 'function'
      ? step({ index: plan.length, from: from + k, remaining: n - k })
      : (step ?? 1);
    if (!Number.isInteger(asked) || asked < 1) {
      throw new Error(`expand(): step must be a whole number of reels, at least 1 (got ${String(asked)}).`);
    }
    let end = Math.min(n, k + asked);
    // Widen until no block inside the step reaches past it. A block that
    // widens the step can pull in a column whose own block reaches further.
    for (let c = k; c < end; c++) end = Math.max(end, reach[c]);
    plan.push(end - k);
    k = end;
  }
  return plan;
}
