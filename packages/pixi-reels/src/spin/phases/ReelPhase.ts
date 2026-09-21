import type { gsap } from 'gsap';
import type { PhaseStepStatus } from '../../events/ReelEvents.js';
import type { Container } from 'pixi.js';
import type { Reel } from '../../core/Reel.js';
import type { SkipContext, SpeedProfile } from '../../config/types.js';
import type { Gsap } from '../../utils/gsap.js';
import {
  configuredStepNames,
  resolvePhaseProfile,
  resolveStepTiming,
} from '../../config/phaseProfile.js';
import { noticeWarnOnce } from '../../utils/notify.js';
import { runStep } from './steps.js';
import type { Cancellable, PhaseStep, RunningStep, StepContext } from './steps.js';

/** What a custom bounce animation receives. See {@link BounceOptions.animation}. */
export interface BounceContext {
  reel: Reel;
  gsap: Gsap;
  /** `reel.container`, the thing to move. */
  container: Container;
  /** The container property that is the travel axis. */
  main: 'x' | 'y';
  /** Where the container rests; return there. */
  base: number;
  /** Overshoot in px, already signed for the reel's direction of travel. */
  distance: number;
  /** Total down-and-back time in seconds. */
  seconds: number;
  ease: string;
}

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
  /** GSAP ease for each leg. Default: the profile's `bounceEase`, then `'power1.out'`. */
  ease?: string;
  /**
   * The tween itself, for a different shape than out-and-back: an elastic
   * settle, three diminishing hops. Gets the numbers above resolved and must
   * end with the container at `base`. The lifted-view bookkeeping is done
   * around it either way. Default: {@link ReelPhase.defaultBounce}.
   */
  animation?: (ctx: BounceContext) => gsap.core.Animation;
}

/** A landing bounce in flight, returned by {@link ReelPhase.bounce}. */
export interface ReelBounce extends Cancellable {
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

/**
 * What the factory knows about the reel a phase is being built for. A
 * registered factory branches on it (`'stop'` building a different phase for
 * a reel that teased), and the phase reads its own profile section through
 * it.
 */
export interface PhaseCreateContext {
  /** The registered name being created, e.g. `'stop'`. Also the profile section this phase reads. */
  readonly phase: string;
  /** Index of the reel in the set, or `-1` when the phase was built outside a spin. */
  readonly reelIndex: number;
  /**
   * The reel ran an anticipation tease TO ITS END earlier in this spin.
   * `false` for the tease itself and every phase before it, `true` from the
   * phase after it on. Selects the `whenAnticipated` half of a profile
   * section, and is what a factory checks to build a different phase for a
   * reel that teased.
   *
   * A tease a `'quicken'` press cut short does not count: the press asked for
   * the landing, and what it cut is the tease `whenAnticipated` exists to pay
   * off. {@link quickened} is here too, so a phase that wants the other
   * reading can take it.
   */
  readonly anticipated: boolean;
  /** A `'quicken'` press has already reached this reel. */
  readonly quickened: boolean;
}

/** What a phase built outside `PhaseFactory.create` knows about its reel: nothing. */
const NO_CONTEXT: PhaseCreateContext = {
  phase: '',
  reelIndex: -1,
  anticipated: false,
  quickened: false,
};

/** Ease for a bounce leg that does not name one. */
const DEFAULT_BOUNCE_EASE = 'power1.out';

const SLAM: SkipContext = { mode: 'slam' };

/** One `runSteps()` pass: the list, the cursor, the step in flight. */
interface StepRun {
  steps: PhaseStep[];
  index: number;
  current: RunningStep | null;
  cancelled: boolean;
  quickened: boolean;
  /** `ctx.until()` predicates waiting on a frame. */
  pending: Array<{ predicate: () => boolean; resolve: () => void }>;
}

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
 * moments every stop phase has to express, landing and bouncing, are
 * {@link land} and {@link bounce}, so a phase written from scratch never has
 * to reach for the reel's internals.
 *
 * The built-in phases run a named list of steps through {@link runSteps},
 * which is what lets a game insert, replace or remove one step of a built-in
 * without subclassing it (`f.register('stop', StopPhase, { steps })`). A
 * custom phase may run its own steps the same way, or ignore the runner and
 * drive the reel from `onEnter` / `update` as before.
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
  /**
   * Whether a `'quicken'` press may reach `onSkip(ctx)`. A phase that
   * declares it branches on `ctx.mode` there and completes itself when the
   * natural end is reached. One that does not is left alone by a quicken
   * (its `cut` steps are still skipped), so a phase written for slams only
   * keeps working. The built-ins declare it.
   */
  readonly quickenable: boolean = false;

  protected _reel: Reel;
  protected _speed: TProfile;
  protected _resolve: (() => void) | null = null;
  protected _isActive = false;
  /** The config `run()` was given, for `ctx.config`. */
  protected _config: TConfig | null = null;
  private _stepRun: StepRun | null = null;
  private _context: PhaseCreateContext = NO_CONTEXT;

  constructor(reel: Reel, speed: TProfile) {
    this._reel = reel;
    this._speed = speed;
  }

  get reel(): Reel {
    return this._reel;
  }

  /**
   * The profile this phase runs on, as the game registered it. A `'quicken'`
   * press that names one swaps it. Read {@link timing} instead to get the
   * phase's own section folded in.
   */
  get speed(): TProfile {
    return this._speed;
  }

  /**
   * The profile with this phase's own section folded into the flat fields:
   * the profile first, then `profile[phase]`, then that section's
   * `whenAnticipated` when the reel teased earlier in this spin.
   *
   * Every field keeps its profile-wide name, so a phase reads
   * `this.timing.spinSpeed` whether the game set `spinSpeed` at the top level
   * or only inside `start`. A profile with no section for this phase returns
   * the profile itself, unchanged.
   */
  get timing(): TProfile {
    return resolvePhaseProfile(
      this._speed,
      this._context.phase || this.name,
      this._context.anticipated,
    );
  }

  /** How this phase was created: which reel, and what had already happened to it. */
  get context(): PhaseCreateContext {
    return this._context;
  }

  /** The reel ran an anticipation tease earlier in this spin. */
  get anticipated(): boolean {
    return this._context.anticipated;
  }

  /**
   * The context `PhaseFactory.create` built this phase with. Called once,
   * before `run()`.
   * @internal
   */
  attachContext(context: PhaseCreateContext): void {
    this._context = context;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** `true` once a `'quicken'` press has reached this phase. */
  get quickened(): boolean {
    return this._stepRun?.quickened ?? this._quickened;
  }
  private _quickened = false;
  private _primedQuicken = false;

  /**
   * The controller's word that a press already quickened this reel before
   * the phase existed: the run starts quickened, so `cut` steps are skipped
   * from the first one on instead of starting and being cut a moment later.
   * `skip(ctx)` still follows `run()`, so `onSkip` keeps its usual order.
   * @internal
   */
  primeQuicken(ctx: SkipContext<TProfile>): void {
    if (ctx.speed) this._speed = ctx.speed;
    this._primedQuicken = true;
  }

  /** Enter the phase. Returns a promise that resolves when the phase is complete. */
  async run(config: TConfig): Promise<void> {
    this._isActive = true;
    this._config = config;
    this._quickened = this._primedQuicken;
    this._primedQuicken = false;
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
   * `'slam'` (the default): if the phase is skippable, the step in flight is
   * cancelled, `onSkip(ctx)` runs and the phase completes at once; the
   * controller then places the reel.
   *
   * `'quicken'`: the phase is asked to reach its natural end sooner without
   * changing what it looks like. A profile named on the press replaces
   * `speed` first. Then, if the phase is {@link quickenable}, `onSkip(ctx)`
   * runs; then every `cut` step is skipped, the one in flight included. A
   * phase that is neither quickenable nor running steps is left to run its
   * course, and still lands. `skippable` is not consulted, since nothing is
   * forced.
   */
  skip(ctx: SkipContext<TProfile> = SLAM as SkipContext<TProfile>): void {
    if (!this._isActive) return;
    if (ctx.mode === 'quicken') {
      if (ctx.speed) this._speed = ctx.speed;
      this._quickened = true;
      if (this.quickenable) this.onSkip(ctx);
      this._quickenSteps();
      return;
    }
    if (!this.skippable) return;
    this._cancelSteps();
    this.onSkip(ctx);
    this._complete();
  }

  /**
   * Slam this phase regardless of `skippable`: cancel the step in flight,
   * `onSkip(ctx)`, complete. What the controller's slam path calls;
   * `ctx.mode` is `'slam'` there.
   */
  forceComplete(ctx: SkipContext<TProfile> = SLAM as SkipContext<TProfile>): void {
    if (!this._isActive) return;
    this._cancelSteps();
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
   * Under `'slam'` this is the slam pose: the base has cancelled the step in
   * flight; kill anything else and leave the reel where a natural finish
   * would have; the base completes the phase after.
   *
   * Under `'quicken'` (only reached when {@link quickenable}) cut a wait,
   * never the landing, and call `_complete()` yourself once the natural end
   * is reached, right away if the slam pose already is that end. A phase on
   * {@link runSteps} usually needs nothing here: its `cut` steps are skipped
   * for it. `ctx.payload` is whatever the game attached to the press.
   */
  protected abstract onSkip(ctx: SkipContext<TProfile>): void;

  /** Call when the phase naturally completes. */
  protected _complete(): void {
    this._cancelSteps();
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve();
    }
  }

  // ─── Steps ──────────────────────────────────────────────────────────

  /**
   * Run `steps` in order and complete the phase after the last one. Each
   * step's result is waited on (a tween or timeline, a promise, a
   * cancellable such as {@link bounce}'s, or nothing). A slam cancels the step
   * in flight; a quicken skips the steps marked `cut`, in flight or upcoming.
   * Call {@link tickSteps} from `update()` so `ctx.until()` can watch the reel.
   */
  protected runSteps(steps: readonly PhaseStep[]): void {
    this._reportUnknownStepConfig(steps);
    this._cancelSteps();
    const run: StepRun = {
      steps: [...steps],
      index: -1,
      current: null,
      cancelled: false,
      quickened: this._quickened,
      pending: [],
    };
    this._stepRun = run;
    this._nextStep(run);
  }

  /**
   * A `steps` key in this phase's profile section that names no step of the
   * list about to run configures nothing and would do it silently. `insertAfter`
   * and friends throw on the same mistake; a profile is data rather than code,
   * so this warns instead of failing the spin.
   */
  private _reportUnknownStepConfig(steps: readonly PhaseStep[]): void {
    const phase = this._context.phase || this.name;
    const configured = configuredStepNames(this._speed, phase);
    if (configured.length === 0) return;
    const have = steps.map((s) => s.name);
    for (const name of configured) {
      if (have.includes(name)) continue;
      noticeWarnOnce(
        `profile-step-${phase}-${name}`,
        `speed profile '${this._speed.name}' configures a step '${name}' on phase ` +
          `'${phase}', which runs no such step (have: ${have.join(', ')}). ` +
          'Nothing is applied for it.',
      );
    }
  }

  /**
   * Feed `ctx.until()` from the phase's `update()`: every pending predicate
   * is checked and the steps waiting on a true one resume.
   */
  protected tickSteps(): void {
    const run = this._stepRun;
    if (!run || run.pending.length === 0) return;
    for (let i = run.pending.length - 1; i >= 0; i--) {
      const waiter = run.pending[i];
      if (!waiter.predicate()) continue;
      run.pending.splice(i, 1);
      waiter.resolve();
    }
  }

  private _nextStep(run: StepRun): void {
    if (run.cancelled || this._stepRun !== run) return;
    run.index += 1;
    const current = run.steps[run.index];
    if (!current) {
      this._stepRun = null;
      this._complete();
      return;
    }
    if (current.cut && run.quickened) {
      this._stepEvent(current.name, 'skipped');
      this._nextStep(run);
      return;
    }
    const controller = new AbortController();
    this._stepEvent(current.name, 'start');
    const running = runStep(
      current.run,
      this._stepContext(run, current.name, controller.signal),
      controller,
    );
    // An instant step (no result, or a 0 ms wait) chains synchronously, so a
    // reel with no start delay begins to move inside `run()` as it always
    // did, not a microtask later.
    if (running.settled) {
      if (run.cancelled) return;
      this._stepEvent(current.name, 'end');
      this._nextStep(run);
      return;
    }
    run.current = running;
    void running.done.then(() => {
      // Cancelled, or skipped by a quicken that already moved on.
      if (run.current !== running) return;
      run.current = null;
      this._stepEvent(current.name, 'end');
      this._nextStep(run);
    });
  }

  /** `phase:step` on the reel: where a step is, for a trace or an events panel. */
  private _stepEvent(step: string, status: PhaseStepStatus): void {
    this._reel.events.emit('phase:step', { phase: this.name, step, status });
  }

  private _stepContext(
    run: StepRun,
    stepName: string,
    signal: AbortSignal,
  ): Omit<StepContext<TConfig, TProfile>, 'signal'> {
    const reel = this._reel;
    const anticipated = this._context.anticipated;
    return {
      reel,
      profile: this.timing,
      step: resolveStepTiming(this._speed, this._context.phase || this.name, stepName, anticipated),
      anticipated,
      config: this._config as TConfig,
      gsap: reel.gsap,
      container: reel.container,
      main: reel.axis.mainProp,
      phase: this,
      get quickened() {
        return run.quickened;
      },
      wait: (ms: number) =>
        new Promise<void>((resolve) => {
          if (ms <= 0 || signal.aborted) {
            resolve();
            return;
          }
          const call = reel.gsap.delayedCall(ms / 1000, resolve);
          signal.addEventListener('abort', () => {
            call.kill();
            resolve();
          });
        }),
      until: (predicate: () => boolean) =>
        new Promise<void>((resolve) => {
          if (signal.aborted || predicate()) {
            resolve();
            return;
          }
          const waiter = { predicate, resolve };
          run.pending.push(waiter);
          signal.addEventListener('abort', () => {
            const i = run.pending.indexOf(waiter);
            if (i !== -1) run.pending.splice(i, 1);
            resolve();
          });
        }),
    };
  }

  private _cancelSteps(): void {
    const run = this._stepRun;
    if (!run) return;
    run.cancelled = true;
    this._stepRun = null;
    const current = run.current;
    run.current = null;
    if (current) {
      current.cancel();
      this._stepEvent(run.steps[run.index]!.name, 'cancelled');
    }
    for (const waiter of run.pending.splice(0)) waiter.resolve();
  }

  private _quickenSteps(): void {
    const run = this._stepRun;
    if (!run || run.cancelled) return;
    run.quickened = true;
    const current = run.steps[run.index];
    if (!current?.cut || !run.current) return;
    const running = run.current;
    run.current = null;
    running.cancel();
    this._stepEvent(current.name, 'cut');
    this._nextStep(run);
  }

  // ─── Landing helpers ────────────────────────────────────────────────

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
  land(cells?: readonly number[]): void {
    const reel = this._reel;
    // haltDrive, not `speed = 0`: under the drive model a bare zero would be
    // ramped straight back toward the old target on the very next tick.
    reel.haltDrive();
    reel.isStopping = false;
    reel.snapToGrid();
    reel.notifySpinEnd();
    reel.notifyLanded(cells);
  }

  /** The built-in bounce: out by `distance`, back to `base`, half the time each. */
  static defaultBounce(ctx: BounceContext): gsap.core.Animation {
    return ctx.gsap
      .timeline()
      .to(ctx.container, { [ctx.main]: ctx.base + ctx.distance, duration: ctx.seconds / 2, ease: ctx.ease })
      .to(ctx.container, { [ctx.main]: ctx.base, duration: ctx.seconds / 2, ease: ctx.ease });
  }

  /**
   * Overshoot the reel in its direction of travel and settle it back, the
   * classic landing bounce. Call it after {@link land}: the overshoot is
   * measured from wherever the reel container rests right now.
   *
   * Moving the container after a landing is not a plain tween. `land()` has
   * just lifted every at-rest unmask symbol into a layer that does NOT
   * inherit the reel's offset, so for as long as the bounce runs the base
   * carries those views along on every frame, and the settle lands them on
   * the exact resting position rather than the tween's last epsilon. That
   * bookkeeping is why the bounce is a helper and not two lines of GSAP, and
   * why a different bounce shape goes through `options.animation` rather
   * than a raw tween of the container.
   *
   * Defaults come from the phase's profile; pass {@link BounceOptions} to
   * bounce differently (a pressed reel that lands on a shorter bounce, say).
   * A non-positive distance returns an already-settled bounce, so the
   * caller's `done` handling is the same either way.
   */
  bounce(options: BounceOptions = {}): ReelBounce {
    const reel = this._reel;
    const distance = options.distance ?? this.timing.bounceDistance;
    if (distance <= 0) {
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
      if (main === followedMain) return;
      reel.offsetLiftedViews(main - followedMain);
      followedMain = main;
    };
    // Every frame, not only the tween's onUpdate: a custom animation has no
    // way to forget the lifted views.
    reel.gsap.ticker.add(followLifted);

    const build = options.animation ?? ReelPhase.defaultBounce;
    const animation = build({
      reel,
      gsap: reel.gsap,
      container: reel.container,
      main: axis.mainProp,
      base,
      distance: axis.polarity * distance,
      seconds: (options.duration ?? this.timing.bounceDuration) / 1000,
      ease: options.ease ?? this.timing.bounceEase ?? DEFAULT_BOUNCE_EASE,
    });

    let finished = false;
    let settle: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      settle = () => {
        if (finished) return;
        finished = true;
        reel.gsap.ticker.remove(followLifted);
        // The last tick can land a hair short of the end value; settle the
        // lifted views on the exact resting position rather than that epsilon.
        followLifted();
        resolve();
      };
    });
    void animation.then(() => settle());

    return {
      done,
      cancel: () => {
        if (finished) return;
        animation.kill();
        axis.setMain(reel.container, base);
        settle();
      },
    };
  }
}
