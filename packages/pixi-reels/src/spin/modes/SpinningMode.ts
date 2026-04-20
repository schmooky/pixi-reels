/**
 * Strategy interface for different reel spinning behaviors.
 *
 * Each mode defines how symbols move during a spin frame
 * and how landing is handled.
 */
export interface SpinningMode {
  readonly name: string;

  /**
   * Compute the Y displacement for this frame.
   * @param symbolHeight - Height of one symbol in pixels.
   * @param speed - Current spin speed (pixels per frame).
   * @param deltaMs - Time since last frame in milliseconds.
   * @returns Y displacement in pixels.
   */
  computeDeltaY(symbolHeight: number, speed: number, deltaMs: number): number;
}
