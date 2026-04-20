import type { SpeedProfile } from '../config/types.js';

/**
 * The tempo of your reels, as named presets.
 *
 * A `SpeedProfile` is a bundle of timings — how long the wind-up takes,
 * how fast the reel scrolls at full speed, how deep the landing bounce
 * is, which GSAP easing drives each transition. `SpeedManager` holds
 * those profiles by name and tracks which one is active.
 *
 * Built-in profiles: `normal` (default), `turbo`, `superTurbo`. Add your
 * own via `reelSet.speed.addProfile('cinematic', {...})`. Switch at
 * runtime with `reelSet.setSpeed('turbo')`.
 *
 * Speed changes take effect on the next spin — mid-spin switching
 * is deliberately not supported to keep animation state simple.
 */
export class SpeedManager {
  private _profiles = new Map<string, SpeedProfile>();
  private _activeName: string;
  private _active: SpeedProfile;

  constructor(profiles: Map<string, SpeedProfile>, initialSpeed: string) {
    for (const [name, profile] of profiles) {
      this._profiles.set(name, profile);
    }
    const initial = this._profiles.get(initialSpeed);
    if (!initial) {
      throw new Error(
        `Speed profile '${initialSpeed}' not found. Available: ${[...this._profiles.keys()].join(', ')}`,
      );
    }
    this._activeName = initialSpeed;
    this._active = initial;
  }

  /** The currently active speed profile. */
  get active(): Readonly<SpeedProfile> {
    return this._active;
  }

  /** Name of the currently active speed profile. */
  get activeName(): string {
    return this._activeName;
  }

  /** Switch to a different named speed profile. */
  set(name: string): { previous: SpeedProfile; current: SpeedProfile } {
    const profile = this._profiles.get(name);
    if (!profile) {
      throw new Error(
        `Speed profile '${name}' not found. Available: ${[...this._profiles.keys()].join(', ')}`,
      );
    }
    const previous = this._active;
    this._activeName = name;
    this._active = profile;
    return { previous, current: profile };
  }

  /** Add or replace a speed profile. */
  addProfile(name: string, profile: SpeedProfile): void {
    this._profiles.set(name, profile);
  }

  /** Get a profile by name, or undefined if not found. */
  getProfile(name: string): SpeedProfile | undefined {
    return this._profiles.get(name);
  }

  /** All registered profile names. */
  get profileNames(): string[] {
    return [...this._profiles.keys()];
  }
}
