import type { ColumnTarget } from '../frame/ColumnTarget.js';

export interface ScatterAnticipationOptions {
  /** The trigger symbol id to scan for (e.g. `'SCAT'`). */
  symbol: string;
  /**
   * How many of `symbol` must be showing before anticipation kicks in.
   * Anticipation begins on the reel AFTER the one that lands the
   * `trigger`-th symbol. Default `2` (the classic "2 scatters and the rest
   * of the reels start teasing").
   */
  trigger?: number;
  /**
   * Which of the remaining reels should tease:
   *   - `'all-remaining'` (default): every reel after the trigger reel teases,
   *     whether or not it actually holds the symbol. Maximum tension.
   *   - `'scatter-only'`: only reels that actually contain the symbol tease.
   *     Use when a result can't complete the feature on some reels and you
   *     don't want to fake tension on reels that don't matter (e.g. a grid
   *     with only 3 scatters total shouldn't slow the empty reels between/after
   *     them).
   */
  mode?: 'all-remaining' | 'scatter-only';
}

/**
 * Decide which reels should show anticipation, straight from a result grid.
 *
 * Scans reels left→right counting `symbol` occurrences; once the running total
 * reaches `trigger`, the reels AFTER that point become the anticipation set
 * (per `mode`). Feed the return value straight into
 * `reelSet.setAnticipation(...)`.
 *
 * Returns an empty array when the grid never reaches `trigger` (no tease).
 *
 * `grid` is the same `ColumnTarget[]` you pass to `reelSet.setResult(...)`, so
 * you can hand the result straight through. Only visible cells are scanned.
 * buffer symbols are off-screen and never trigger tension.
 *
 * @example
 * // Result has SCAT on reels 0 and 1 → tease reels [2,3,4].
 * const grid = [{ visible: ['A','SCAT','B'] }, { visible: ['SCAT','A','B'] }, ...];
 * const reels = anticipationForScatters(grid, { symbol: 'SCAT', trigger: 2 });
 * reelSet.setResult(grid);
 * reelSet.setAnticipation(reels, { stagger: 'sequential', slowdown: { from: 0.4, to: 0.1 } });
 *
 * @example
 * // Only 3 scatters total (reels 0,1,3): 'scatter-only' teases just reel [3],
 * // leaving reels 2 and 4 to stop normally.
 * const reels = anticipationForScatters(grid, { symbol: 'SCAT', mode: 'scatter-only' });
 */
export function anticipationForScatters(
  grid: ColumnTarget[],
  opts: ScatterAnticipationOptions,
): number[] {
  const trigger = opts.trigger ?? 2;
  const mode = opts.mode ?? 'all-remaining';

  // Count the trigger symbol per reel. Only visible cells are scanned; buffer
  // symbols are off-screen and must not trigger tension.
  const perReelCount = grid.map(
    (col) => col.visible.filter((id) => id === opts.symbol).length,
  );

  // Find the reel at which the running total first reaches `trigger`.
  let running = 0;
  let triggerReel = -1;
  for (let i = 0; i < perReelCount.length; i++) {
    running += perReelCount[i];
    if (running >= trigger) {
      triggerReel = i;
      break;
    }
  }
  if (triggerReel === -1) return [];

  const result: number[] = [];
  for (let i = triggerReel + 1; i < grid.length; i++) {
    if (mode === 'all-remaining' || perReelCount[i] > 0) result.push(i);
  }
  return result;
}
