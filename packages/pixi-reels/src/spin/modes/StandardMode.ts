import type { SpinningMode } from './SpinningMode.js';

/**
 * Standard top-to-bottom reel spinning.
 * Symbols scroll downward at constant speed, wrapping around.
 */
export class StandardMode implements SpinningMode {
  readonly name = 'standard';

  computeDeltaY(symbolHeight: number, speed: number, deltaMs: number): number {
    const raw = (symbolHeight * speed * deltaMs) / 1000;
    // Cap at half symbol height to prevent skipping
    return Math.min(raw, symbolHeight / 2);
  }
}
