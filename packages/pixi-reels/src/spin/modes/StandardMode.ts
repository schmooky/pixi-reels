import type { SpinningMode } from './SpinningMode.js';

/**
 * Standard top-to-bottom reel spinning.
 * Symbols scroll downward at constant speed, wrapping around.
 */
export class StandardMode implements SpinningMode {
  readonly name = 'standard';

  computeDeltaY(symbolHeight: number, speed: number, deltaMs: number): number {
    const raw = (symbolHeight * speed * deltaMs) / 1000;
    // Cap displacement to half a symbol in EITHER direction. ReelMotion wraps
    // at most once per displace() call, so an unclamped step (e.g. the negative
    // step-back speed in StartPhase, or a large deltaMs spike) would skip a wrap
    // and desync the symbol array from what's on screen.
    const cap = symbolHeight / 2;
    return Math.max(Math.min(raw, cap), -cap);
  }
}
