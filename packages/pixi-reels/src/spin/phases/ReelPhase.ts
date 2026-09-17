import type { Reel } from '../../core/Reel.js';
import type { SkipContext, SpeedProfile } from '../../config/types.js';
import { defaultMoves, runMove } from './moves.js';
import type { BounceMoveContext, ResolvedPhaseMoves } from './moves.js';

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

const SLAM: SkipContext = { mode: 'slam' };

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
 * `this.speed`. What the built-in phases call on the reel is the contract a
 * custom phase may rely on too: `placeStrip()`, `beginMotion()`,
 * `notifySpinStart()`, `forceSpeed()` and the public accessors. The two
 * moments every stop phase has to express, landing and bouncing, are the
 * protected helpers {@link land} and {@link bounce}, so a phase written from
 * scratch never has to reach for the reel's internals. The animated beats
 * of the built-in phases are {@link moves}, replaceable per set through
 * `builder.moves()`.
 *
 * @typeParam TConfig - Phase-specific configuration type.
 * @typeParam TProfile - The speed profile this phase reads. Widen it when a
 *   phase carries its own timing on the profile (`interface InstantProfile
 *   extends SpeedProfile { slideMs: number }`): the manager hands every phase
 *   the profile instance the game registered, so the extra fields are there
 *   at run time, and the parameter is what lets `this.speed` see them.
 */
export abstract class ReelPhase<TConfig = void, TProfile extends SpeedProfile = SpeedProfile> {
  abstract readonly name: string;
  abstract readonly skippable: boolean;

  protected _reel: Reel;
  protected _speed: TProfile;
  protected _resolve: (() => void) | null = null;
  protected _isActive = false;
  protected _moves: ResolvedPhaseMoves = defaultMoves;

  constructor(reel: Reel, speed: TProfile) {
    this._reel = reel;
    this._speed = speed;
  }

  get reel(): Reel {
    return this._reel;
  }

  /** The profile this phase runs on. A `'quicken'` press that names one swaps it. */
  get speed(): TProfile {
    return this._speed;
  }

  /** The animated beats this set replaced, defaults where it did not. See `builder.moves()`. */
  protected get moves(): ResolvedPhaseMoves {
    return this._moves;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** @internal Set by `PhaseFactory.create()` from the builder's `moves()`. */
  bindMoves(moves: ResolvedPhaseMoves): void {
    this._moves = moves;
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

  /**
   * A skip press reached this phase.
   *
   * `'slam'` (the default): if the phase is skippable, `onSkip(ctx)` runs and
   * the phase completes at once; the controller then places the reel.
   *
   * `'quicken'`: `onSkip(ctx)` runs and nothing else. The phase is asked to
   * reach its natural end sooner without changing what it looks like, and it
   * completes itself when it gets there: a stop cuts its delay and spins out,
   * a tease ends and returns to full speed, a spin drops its floor. A phase
   * whose slam pose IS its natural end completes inside `onSkip`. A phase
   * that does not handle `'quicken'` runs its course and the reel still
   * lands. `skippable` is not consulted, since nothing is forced. A profile
   * named on the press replaces `speed` first, so whatever the phase plays
   * from here reads the new one.
   */
  skip(ctx: SkipContext<TProfile> = SLAM as SkipContext<TProfile>): void {
    if (!this._isActive) return;
    if (ctx.mode === 'quicken') {
      if (ctx.speed) this._speed = ctx.speed;
      this.onSkip(ctx);
      return;
    }
    if (!this.skippable) return;
    this.onSkip(ctx);
    this._complete();
  }

  /**
   * Slam this phase regardless of `skippable`: `onSkip(ctx)` then complete.
   * What the controller's slam path calls; `ctx.mode` is `'slam'` there.
   */
  forceComplete(ctx: SkipContext<TProfile> = SLAM as SkipContext<TProfile>): void {
    if (!this._isActive) return;
    this.onSkip(ctx);
    this._complete();
  }

  /** Called each frame while the phase is active. */
  abstract update(deltaMs: number): void;

  /** Subclass: set up the phase (start tweens, set speed, etc). */
  protected abstract onEnter(config: TConfig): void;

  /**
   * Subclass: a skip press reached the phase. Branch on `ctx.mode`.
   *
   * Under `'slam'` this is the slam pose: kill tweens and leave the reel
   * where a natural finish would have; the base completes the phase after.
   *
   * Under `'quicken'` cut a wait, never the landing, and call `_complete()`
   * yourself once the natural end is reached (right away, if the slam pose
   * already is that end). Ignore the mode and the phase simply runs its
   * course. `ctx.payload` is whatever the game attached to the press.
   */
  protected abstract onSkip(ctx: SkipContext<TProfile>): void;

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
   * The tween itself is the set's `stop.bounce` move (see `builder.moves()`),
   * so a replaced bounce plays here too. Defaults come from the phase's
   * profile; pass {@link BounceOptions} to bounce differently from the
   * profile (a pressed reel that lands on a shorter bounce, say). A
   * non-positive distance, or a removed move, returns an already-settled
   * bounce, so the caller's `done` handling is the same either way.
   */
  protected bounce(options: BounceOptions = {}): ReelBounce {
    const reel = this._reel;
    const distance = options.distance ?? this._speed.bounceDistance;
    const move = this._moves.stop.bounce;
    if (distance <= 0 || !move) {
      return { done: Promise.resolve(), cancel: () => {} };
    }

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

    const running = runMove<BounceMoveContext>(move, {
      reel,
      profile: this._speed,
      gsap: reel.gsap,
      distance: axis.polarity * distance,
      duration: options.duration ?? this._speed.bounceDuration,
      ease: options.ease ?? DEFAULT_BOUNCE_EASE,
      base,
      followLifted,
    });

    let finished = false;
    const done = running.done.then(() => {
      if (finished) return;
      finished = true;
      // The last onUpdate can land a hair short of the end value; settle the
      // lifted views on the exact resting position rather than that epsilon.
      followLifted();
    });

    return {
      done,
      cancel: () => {
        if (finished) return;
        finished = true;
        running.cancel();
        axis.setMain(reel.container, base);
        followLifted();
      },
    };
  }
}
