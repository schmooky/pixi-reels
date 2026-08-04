/**
 * `movePin()` must fly the symbol along the reel's own axis.
 *
 * Every other pin-overlay site goes through `reel.axis.setMain/setCross`.
 * `movePin` was the one caller left reading `_pinOverlayCellMain` (a
 * TRAVEL-axis coordinate) straight into `.y`, and `reel.container.x`
 * straight into `.x`. On a vertical set those happen to coincide, so it
 * looked fine. On a horizontal set `mainProp` is `'x'`, so the main
 * coordinate was written to `y` and the reel's main offset to `x` -- the
 * flight symbol crossed the board diagonally to a position that means
 * nothing. Both values are numbers, so nothing threw and nothing failed to
 * typecheck.
 *
 * `orientation()` promises "everything else is orientation-neutral", so
 * this asserts the promise rather than the implementation: the flight
 * symbol starts on the cell it left.
 */
import { describe, expect, it } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { ReelSymbol } from '../../src/symbols/ReelSymbol.js';

const W = 120;
const H = 80;

const build = (orientation: 'vertical' | 'horizontal') =>
  createTestReelSet({
    reels: 3,
    visibleCells: 3,
    symbolIds: ['a', 'b'],
    orientation,
    symbolSize: orientation === 'vertical' ? { width: W, height: H } : { width: H, height: W },
  });

/** The in-flight symbol movePin parks on the unmasked container. */
function flightView(reelSet: ReturnType<typeof build>['reelSet']) {
  const kids = reelSet.viewport.unmaskedContainer.children;
  const view = kids[kids.length - 1];
  if (!view) throw new Error('movePin spawned no flight symbol');
  return view;
}

describe.each(['vertical', 'horizontal'] as const)('movePin on a %s set', (orientation) => {
  it('starts the flight symbol on the cell it is leaving', async () => {
    const { reelSet, destroy } = build(orientation);
    try {
      const from = { reel: 0, cell: 1 };
      reelSet.pin(from.reel, from.cell, 'a', { turns: 'permanent' });

      // Where the engine itself says that cell is. getCellBounds is
      // screen-space in both orientations, and is what every other overlay
      // site agrees with.
      const bounds = reelSet.getCellBounds(from.reel, from.cell);

      const moving = reelSet.movePin(from, { reel: 1, cell: 1 }, { duration: 10 });
      // Read the spawn position, then let the tween finish BEFORE asserting.
      // Throwing here with a tween still in flight would tear the set down
      // underneath it and bury the real failure in unhandled errors.
      const view = flightView(reelSet);
      const spawn = { x: view.x, y: view.y };
      await moving;

      expect(spawn.x).toBeCloseTo(bounds.x, 3);
      expect(spawn.y).toBeCloseTo(bounds.y, 3);
    } finally {
      destroy();
    }
  });
});
