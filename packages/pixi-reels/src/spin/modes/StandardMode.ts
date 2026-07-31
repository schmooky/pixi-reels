import type { SpinningMode } from './SpinningMode.js';

/**
 * Standard top-to-bottom reel spinning.
 * Symbols scroll downward at constant speed, wrapping around.
 */
export class StandardMode implements SpinningMode {
  readonly name = 'standard';

  computeDelta(slotPitch: number, speed: number, deltaMs: number): number {
    const raw = (slotPitch * speed * deltaMs) / 1000;
    // Cap displacement to half a slot in either direction. ReelMotion no longer
    // requires this for correctness (it derives rotation from total travel), but
    // a half-slot cap keeps per-frame motion smooth and bounds pathological
    // deltaMs spikes; the sign carries StartPhase's step-back pull unchanged.
    const cap = slotPitch / 2;
    return Math.max(Math.min(raw, cap), -cap);
  }
}
