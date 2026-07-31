import type { SpinningMode } from './SpinningMode.js';

/**
 * Cascade/tumble spinning mode.
 * Symbols fall from above with gravity-like acceleration,
 * used for tumble/avalanche mechanics.
 */
export class CascadeMode implements SpinningMode {
  readonly name = 'cascade';

  private _gravity: number;

  /**
   * @param gravity - Gravity acceleration factor. Default: 1.5.
   */
  constructor(gravity: number = 1.5) {
    this._gravity = gravity;
  }

  computeDelta(slotPitch: number, speed: number, deltaMs: number): number {
    const raw = (slotPitch * speed * this._gravity * deltaMs) / 1000;
    // Full-slot cap. The old wrap-skip risk (contract L7) is gone now that
    // ReelMotion derives rotation from total travel, so this only bounds the
    // per-frame step; cascade speed is never negative.
    return Math.min(raw, slotPitch);
  }
}
