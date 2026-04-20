import type { SpeedProfile } from './types.js';

/**
 * Built-in speed profiles covering common slot game needs.
 *
 * Bounce values are tuned for the typical 120–200px symbol range. For larger
 * or smaller symbols, register a custom profile or override `bounceDistance`.
 * `bounceDuration` is the total time for the two-leg bounce (down then back).
 */
export const SpeedPresets = {
  NORMAL: {
    name: 'normal',
    spinDelay: 100,
    spinSpeed: 30,
    stopDelay: 140,
    anticipationDelay: 450,
    bounceDistance: 56,
    bounceDuration: 600,
    accelerationEase: 'power2.in',
    decelerationEase: 'power2.out',
    accelerationDuration: 300,
    minimumSpinTime: 500,
  },
  TURBO: {
    name: 'turbo',
    spinDelay: 30,
    spinSpeed: 50,
    stopDelay: 0,
    anticipationDelay: 250,
    bounceDistance: 42,
    bounceDuration: 200,
    accelerationEase: 'power2.in',
    decelerationEase: 'power2.out',
    accelerationDuration: 200,
    minimumSpinTime: 300,
  },
  SUPER_TURBO: {
    name: 'superTurbo',
    spinDelay: 0,
    spinSpeed: 80,
    stopDelay: 0,
    anticipationDelay: 0,
    bounceDistance: 14,
    bounceDuration: 120,
    accelerationEase: 'power1.in',
    decelerationEase: 'power1.out',
    accelerationDuration: 50,
    minimumSpinTime: 100,
  },
} as const satisfies Record<string, SpeedProfile>;
