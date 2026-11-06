import type { Cell, ReelSet } from 'pixi-reels';

/**
 * The win beat a cascade owes its winners before they go: the losers dim,
 * the winners play their wow at once, the board holds for a moment, and
 * only then does the library destroy the cells. Hand it to
 * `runCascade({ presentWinners })`.
 *
 * ```ts
 * await reelSet.runCascade({ presentWinners: presentWithSpotlight(reelSet), ... });
 * ```
 */
export function presentWithSpotlight(
  reelSet: ReelSet,
  options: { dimAmount?: number; hold?: number } = {},
): (info: { winners: readonly Cell[] }) => Promise<void> {
  const { dimAmount = 0.7, hold = 350 } = options;
  return async ({ winners }) => {
    const positions = winners.map((c) => ({ reelIndex: c.reel, cellIndex: c.cell }));
    await reelSet.spotlight.show(positions, { dimAmount, playWinAnimation: true });
    await new Promise((r) => setTimeout(r, hold));
    reelSet.spotlight.hide();
  };
}
