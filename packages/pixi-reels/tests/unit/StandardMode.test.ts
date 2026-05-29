/**
 * M5 — StandardMode.computeDeltaY must clamp displacement symmetrically.
 * Clamping only the positive side let the StartPhase step-back (negative speed)
 * or a large deltaMs move more than one slot in a tick, skipping ReelMotion's
 * single-wrap-per-call invariant and desyncing the symbol array from the view.
 */
import { describe, it, expect } from 'vitest';
import { StandardMode } from '../../src/spin/modes/StandardMode.js';

describe('StandardMode.computeDeltaY', () => {
  const mode = new StandardMode();
  const H = 100;

  it('caps positive displacement at half a symbol', () => {
    expect(mode.computeDeltaY(H, 1000, 1000)).toBe(H / 2);
  });

  it('caps negative (step-back) displacement at minus half a symbol', () => {
    // Was unclamped before the fix (Math.min(-big, 50) === -big).
    expect(mode.computeDeltaY(H, -1000, 1000)).toBe(-H / 2);
  });

  it('passes sub-cap displacements through unchanged', () => {
    expect(mode.computeDeltaY(H, 0.3, 16)).toBeCloseTo(0.48, 5);
    expect(mode.computeDeltaY(H, -0.3, 16)).toBeCloseTo(-0.48, 5);
  });
});
