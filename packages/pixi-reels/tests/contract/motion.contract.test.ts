/**
 * ADR 018's fourteen laws, run against the SHIPPING `ReelMotion` in all four
 * orientation x direction combinations.
 *
 * This is the gate the axis work was missing: every commit from A4 onward
 * changed how a position is derived, and until now the only check was a
 * vertical-only suite that structurally could not observe a transposition.
 */
import { describe } from 'vitest';
import { ReelMotion } from '../../src/core/ReelMotion.js';
import { reelAxis } from '../../src/core/ReelAxis.js';
import type { ReelSymbol } from '../../src/symbols/ReelSymbol.js';
import {
  runCrossAxisContract,
  runMotionContract,
  type MotionFactory,
} from './motionContract.js';

const factory: MotionFactory = (symbols, geo, onWrapped, axis) =>
  new ReelMotion(
    symbols as unknown as ReelSymbol[],
    geo.cellSize,
    geo.gap,
    geo.bufferStart,
    geo.visibleCells,
    geo.bufferEnd,
    onWrapped as unknown as (s: ReelSymbol) => void,
    axis,
  );

const COMBOS = [
  ['vertical', 'forward'],
  ['vertical', 'reverse'],
  ['horizontal', 'forward'],
  ['horizontal', 'reverse'],
] as const;

for (const [orientation, direction] of COMBOS) {
  describe(`motion contract: ${orientation} / ${direction}`, () => {
    runMotionContract(factory, reelAxis(orientation, direction));
  });
}

describe('motion contract: cross-axis', () => {
  runCrossAxisContract(factory, {
    verticalForward: reelAxis('vertical', 'forward'),
    horizontalForward: reelAxis('horizontal', 'forward'),
    verticalReverse: reelAxis('vertical', 'reverse'),
  });
});
