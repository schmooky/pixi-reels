import type { gsap } from 'gsap';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';

/**
 * Shape of one landing bounce, for {@link ReelPhase.bounce}. Every field
 * falls back to the phase's speed profile, so a phase that wants the
 * profile's own bounce passes nothing.
 */
export interface BounceOptions {
  /**
   * Overshoot in px, in the reel's direction of travel. Default: the
   * profile's `bounceDistance`. `0` or less means no bounce at all.
   */
  distance?: number;
  /**
   * Total down-and-back time in ms; each leg takes half. Default: the
   * profile's `bounceDuration`.
   */
  duration?: number;
  /** GSAP ease for each leg. Default `'power1.out'`. */
  ease?: string;
}

/** A landing bounce in flight, returned by {@link ReelPhase.bounce}. */
export interface ReelBounce {
  /**
   * Settles once the reel is back on its resting position, or right after
   * `cancel()`. Never rejects, so a phase can `await` it without a guard.
   */
  readonly done: Promise<void>;
  /**
   * Kill the tween and rest the reel where the bounce began. What a phase
   * does from `onSkip()` when a slam lands mid-bounce. Idempotent, and a
   * no-op once the bounce has settled.
   */
  cancel(): void;
}

/** Ease for a bounce leg that does not name one. */
const DEFAULT_BOUNCE_EASE = 'power1.out';

/**
 * Abstract base for reel spin phases.
 *
 * Each phase represents one stage of the spin lifecycle:
 * START → SPIN → ANTICIPATION → STOP.
 *
 * Phases are entered and exited by SpinController, and can be skipped
 * if marked as skippable and the user triggers skip/slam-stop.
 *
 * A phase drives its reel through `this.reel` and reads its timing from
 * `this._speed`. What the built-in phases call on the reel is the contract a
 * custom phase may rely on too: `placeStrip()`, `beginMotion()`,
 * `notifySpinStart()`, `forceSpeed()` and the public accessors. The two
 * moments every stop phase has to express, landing and bouncing, are the
 * protected helpers {@link land} and {@link bounce}, so a phase written from
 * scratch never has to reach for the reel's internals.
 *
 * @typeParam TConfig - Phase-specific configuration type.
 * @typeParam TProfile - The speed profile this phase reads. Widen it when a
 *   phase carries its own timing on the profile (`interface InstantProfile
 *   extends SpeedProfile { slideMs: number }`): the manager hands every phase
 *   the profile instance the game registered, so the extra fields are there
 *   at run time, and the parameter is what lets `this._speed` see them.
 */
export abstract class ReelPhase<TConfig = void, TProfile extends SpeedProfile = SpeedProfile> {
  abstract readonly name: string;
  abstract readonly skippable: boolean;

  protected _reel: Reel;
  protected _speed: TProfile;
  protected _resolve: (() => void) | null = null;
  protected _isActive = false;

  constructor(reel: Reel, speed: TProfile) {
    this._reel = reel;
    this._speed = speed;
  }

  get reel(): Reel {
    return this._reel;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** Enter the phase. Returns a promise that resolves when the phase is complete. */
  async run(config: TConfig): Promise<void> {
    this._isActive = true;
    this._reel.events.emit('phase:enter', this.name);

    return new Promise<void>((resolve) => {
      this._resolve = () => {
        this._isActive = false;
        this._reel.events.emit('phase:exit', this.name);
        resolve();
      };
      this.onEnter(config);
    });
  }

  /** Skip the phase immediately (if skippable). */
  skip(): void {
    if (!this.skippable || !this._isActive) return;
    this.onSkip();
    this._complete();
  }

  /** Force-complete the phase regardless of skippable flag. */
  forceComplete(): void {
    if (!this._isActive) return;
    this.onSkip();
    this._complete();
  }

  /**
   * Advance to this phase's natural end as fast as its animation allows,
   * WITHOUT changing the outcome. The counterpart of `skip()`, which
   * force-completes and may place the frame outright: a hurried stop still
   * spins its frame in and bounces, it just stops waiting first. What a
   * `requestHurry()` press asks of the reel it frees.
   *
   * With `speed`, the phase carries on with that profile from here: the
   * spin-out speed and bounce a hurried stop lands on.
   *
   * Returns `false` when the phase cannot be hurried. The reel then runs the
   * phase to its natural end, and the controller applies the rest of the
   * hurry (no stop delay, no tease, the named profile) at the chain's next
   * decision point. A reel hurried before it reached its stop has its stop
   * phase asked as soon as it is created, so a wait inside a custom stop is
   * cut whether the press came before it or during it.
   */
  hurry(speed?: TProfile): boolean {
    if (!this._isActive) return false;
    if (speed) this._speed = speed;
    return this.onHurry();
  }

  /** Called each frame while the phase is active. */
  abstract update(deltaMs: number): void;

  /** Subclass: set up the phase (start tweens, set speed, etc). */
  protected abstract onEnter(config: TConfig): void;

  /** Subclass: clean up when skipped or force-completed. */
  protected abstract onSkip(): void;

  /**
   * Subclass: reach the natural end sooner without changing what it looks
   * like. Cut a wait (a delay, a hold, a tease), leave the landing itself
   * alone, and return `true`. The default returns `false`: this phase cannot
   * be hurried and runs its course.
   */
  protected onHurry(): boolean {
    return false;
  }

  /** Call when the phase naturally completes. */
  protected _complete(): void {
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve();
    }
  }

  /**
   * Bring the reel to rest on the frame it is showing and announce the
   * landing: the drive halts, the strip snaps to the cell grid, symbols are
   * told the spin is over and then that they landed (which lifts unmask
   * symbols above the mask and plays the landing animation), and the reel's
   * `landing` event fires, bridged to the set's `spin:reelLanding`.
   *
   * Place the frame first (`this.reel.placeStrip(frame)`), or let the spin-out
   * carry it in as `StopPhase` does; this call does not choose the symbols.
   * It is the whole of what `StopPhase` does between its spin-out and its
   * bounce, and the only way a phase lands a reel.
   *
   * @param cells - Visible cells (0-indexed) whose symbols receive
   *   `onReelLanded()`. Omit for a strip landing, where every visible symbol
   *   landed; pass the cells that moved when only some did.
   */
  protected land(cells?: readonly number[]): void {
    const reel = this._reel;
    // haltDrive, not `speed = 0`: under the drive model a bare zero would be
    // ramped straight back toward the old target on the very next tick.
    reel.haltDrive();
    reel.isStopping = false;
    reel.snapToGrid();
    reel.notifySpinEnd();
    reel.notifyLanded(cells);
  }

  /**
   * Overshoot the reel in its direction of travel and settle it back, the
   * classic landing bounce. Call it after {@link land}: the overshoot is
   * measured from wherever the reel container rests right now.
   *
   * Moving the container after a landing is not a plain tween. `land()` has
   * just lifted every at-rest unmask symbol into a layer that does NOT
   * inherit the reel's offset, so every frame of the bounce carries those
   * views along by hand, and the settle lands them on the exact resting
   * position rather than the tween's last epsilon. That bookkeeping is why
   * the bounce is a helper and not two lines of GSAP.
   *
   * Defaults come from the phase's profile; pass {@link BounceOptions} to
   * bounce differently from the profile (a pressed reel that lands on a
   * shorter bounce, say). A non-positive distance returns an already-settled
   * bounce, so the caller's `done` handling is the same either way.
   */
  protected bounce(options: BounceOptions = {}): ReelBounce {
    const reel = this._reel;
    const distance = options.distance ?? this._speed.bounceDistance;
    if (distance <= 0) {
      return { done: Promise.resolve(), cancel: () => {} };
    }

    // Half of the total per leg, in seconds. Both legs share a duration so
    // the down + up motion is symmetric.
    const legDuration = (options.duration ?? this._speed.bounceDuration) / 2000;
    const ease = options.ease ?? DEFAULT_BOUNCE_EASE;
    // Overshoot in the direction of travel: forward reels overshoot toward the
    // larger main coordinate, reverse reels toward the smaller. axis.polarity
    // makes this automatic and keeps vertical/forward at `base + distance`.
    const axis = reel.axis;
    const base = axis.getMain(reel.container);

    let followedMain = base;
    const followLifted = (): void => {
      const main = axis.getMain(reel.container);
      reel.offsetLiftedViews(main - followedMain);
      followedMain = main;
    };

    let settle: (() => void) | null = null;
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    let timeline: gsap.core.Timeline | null = reel.gsap.timeline();
    timeline.to(reel.container, {
      [axis.mainProp]: base + axis.polarity * distance,
      duration: legDuration,
      ease,
      onUpdate: followLifted,
    });
    timeline.to(reel.container, {
      [axis.mainProp]: base,
      duration: legDuration,
      ease,
      onUpdate: followLifted,
      onComplete: () => {
        // The last onUpdate can land a hair short of the end value; settle the
        // lifted views on the exact resting position rather than that epsilon.
        followLifted();
        timeline = null;
        settle?.();
      },
    });

    return {
      done,
      cancel: () => {
        if (!timeline) return;
        timeline.kill();
        timeline = null;
        axis.setMain(reel.container, base);
        followLifted();
        settle?.();
      },
    };
  }
}
