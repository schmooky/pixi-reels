/**
 * Strategy interface for different reel spinning behaviors.
 *
 * Each mode defines how symbols move during a spin frame
 * and how landing is handled.
 */
export interface SpinningMode {
  readonly name: string;

  /**
   * Compute the travel displacement for this frame, in screen pixels along the
   * reel's travel axis (sign is relative to the reel's direction).
   * @param slotPitch - One cell's pitch in pixels (symbol size + gap).
   * @param speed - Current spin speed (pixels per frame).
   * @param deltaMs - Time since last frame in milliseconds.
   * @returns travel displacement in pixels.
   */
  computeDelta(slotPitch: number, speed: number, deltaMs: number): number;
}
