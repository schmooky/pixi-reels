import type { PhaseProfiles, SpeedProfile } from '../config/types.js';
import type { AnyPhaseSection } from '../config/phaseProfile.js';
import { mergeSection, tuneProfile } from '../config/phaseProfile.js';

/**
 * The tempo of your reels, as named presets.
 *
 * A `SpeedProfile` is a bundle of timings. how long the wind-up takes,
 * how fast the reel scrolls at full speed, how deep the landing bounce
 * is, which GSAP easing drives each transition. `SpeedManager` holds
 * those profiles by name and tracks which one is active.
 *
 * Built-in profiles: `normal` (default), `turbo`, `superTurbo`. Add your
 * own via `reelSet.speed.addProfile('cinematic', {...})`. Switch at
 * runtime with `reelSet.setSpeed('turbo')`.
 *
 * Speed changes take effect on the next spin. mid-spin switching
 * is deliberately not supported to keep animation state simple.
 */
export class SpeedManager {
  private _profiles = new Map<string, SpeedProfile>();
  private _activeName: string;
  private _active: SpeedProfile;
  /** Run-time section overrides, by phase name. See {@link tune}. */
  private _tunes = new Map<string, AnyPhaseSection>();
  /** {@link active} with `_tunes` folded in, rebuilt whenever either changes. */
  private _tuned: SpeedProfile | null = null;

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

  /** The currently active speed profile, with any run-time {@link tune} folded in. */
  get active(): Readonly<SpeedProfile> {
    if (this._tunes.size === 0) return this._active;
    if (!this._tuned) this._tuned = tuneProfile(this._active, this._tunes);
    return this._tuned;
  }

  /**
   * Override part of one phase's section at run time, without editing the
   * registered profile.
   *
   * The override is merged into whatever the active profile already says for
   * that phase: flat fields replace, per-step config merges segment by
   * segment, so naming one step's ease leaves the rest of the section
   * standing. Tunes are a layer on top of whichever profile is active, so
   * they survive `set('turbo')` until {@link clearTune}.
   *
   * Like a speed change, a tune takes effect on the next spin: the controller
   * captures `active` once per spin and hands that instance to every phase.
   *
   * @example
   * reelSet.speed.tune('stop', { steps: { bounce: { ease: 'back.out(2)' } } });
   */
  tune<K extends keyof PhaseProfiles & string>(phase: K, section: PhaseProfiles[K]): void {
    this._tunes.set(phase, mergeSection(this._tunes.get(phase), section));
    this._tuned = null;
  }

  /** Drop the tune for one phase, or every tune when called with no argument. */
  clearTune(phase?: keyof PhaseProfiles & string): void {
    if (phase === undefined) this._tunes.clear();
    else this._tunes.delete(phase);
    this._tuned = null;
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
    this._tuned = null;
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
