import type { SpinningMode } from './SpinningMode.js';

/**
 * Immediate placement mode for super-turbo skip.
 * Symbols snap to position instantly — no actual spinning animation.
 */
export class ImmediateMode implements SpinningMode {
  readonly name = 'immediate';

  computeDeltaY(_symbolHeight: number, _speed: number, _deltaMs: number): number {
    // No movement — placement is handled directly by the phase
    return 0;
  }
}
