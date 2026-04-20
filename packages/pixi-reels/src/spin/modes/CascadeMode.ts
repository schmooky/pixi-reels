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

  computeDeltaY(symbolHeight: number, speed: number, deltaMs: number): number {
    const raw = (symbolHeight * speed * this._gravity * deltaMs) / 1000;
    return Math.min(raw, symbolHeight);
  }
}
