import type { gsap } from 'gsap';
import type { Container } from 'pixi.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { Gsap } from '../../utils/gsap.js';
import type { ReelPhase } from './ReelPhase.js';

/**
 * What every step of a phase receives. The reel and the numbers a step
 * needs, plus two ways to wait that a slam can cut: `wait` for time, `until`
 * for a condition the reel reaches on some frame.
 */
export interface StepContext<TConfig = unknown, TProfile extends SpeedProfile = SpeedProfile> {
  reel: Reel;
  /** The profile the phase runs on. A `'quicken'` press that named one has swapped it in. */
  profile: TProfile;
  /** What the controller handed the phase in `run(config)`. */
  config: TConfig;
  gsap: Gsap;
  /** `reel.container`, the thing a landing bounce moves. */
  container: Container;
  /** The container property that is the reel's travel axis: `'y'` on a vertical set, `'x'` on a horizontal one. */
  main: 'x' | 'y';
  /** The phase running the step, for `phase.land()` / `phase.bounce()` and its protected state from a subclass. */
  phase: ReelPhase<TConfig, TProfile>;
  /**
   * Aborted when a slam cuts the step, or a quicken cuts a `cut` step. A
   * step that returns a promise stops its own work on it; a returned tween or
   * bounce is cancelled for it.
   */
  signal: AbortSignal;
  /** `true` once a quicken has reached this phase, so a step can shorten itself. */
  readonly quickened: boolean;
  /** Wait `ms` on the gsap clock. Resolves early, aborted, when the step is cut. */
  wait(ms: number): Promise<void>;
  /**
   * Resolve on the first frame `predicate()` is true, checked from the
   * phase's `update()`. What a spin-out waits on: not a time, a state.
   */
  until(predicate: () => boolean): Promise<void>;
}

/** Something a step may hand back to be waited on and cancelled. */
export interface Cancellable {
  readonly done: Promise<void>;
  cancel(): void;
}

/** A step in flight, from {@link runStep}. */
export interface RunningStep extends Cancellable {
  /** `true` once `done` has settled, so an instant step can be chained without a microtask. */
  readonly settled: boolean;
}

/**
 * What a step returns: a gsap tween or timeline (killed on cancel), a
 * promise (told to stop through `ctx.signal`), a {@link Cancellable} such as
 * the object `phase.bounce()` returns, or nothing for a step that is instant.
 */
export type StepResult = gsap.core.Animation | Promise<void> | Cancellable | void;

/** One step of a phase: a name to address it by, and what it does. */
export interface PhaseStep<TCtx extends StepContext<any, any> = StepContext<any, any>> {
  readonly name: string;
  readonly run: (ctx: TCtx) => StepResult;
  /**
   * A wait rather than a landing beat: a `'quicken'` press skips it, in
   * flight or upcoming, and leaves every other step in place.
   */
  readonly cut?: boolean;
}

/** Build a {@link PhaseStep}. */
export function step<TCtx extends StepContext<any, any> = StepContext<any, any>>(
  name: string,
  run: (ctx: TCtx) => StepResult,
  options: { cut?: boolean } = {},
): PhaseStep<TCtx> {
  return { name, run, cut: options.cut };
}

/** The list a phase runs, after the game's edit. Passed the built-in list, returns the list to run. */
export type StepsEditor<TCtx extends StepContext<any, any> = StepContext<any, any>> = (
  steps: PhaseStep<TCtx>[],
) => PhaseStep<TCtx>[];

function indexOf<TCtx extends StepContext<any, any>>(steps: readonly PhaseStep<TCtx>[], name: string): number {
  const i = steps.findIndex((s) => s.name === name);
  if (i === -1) {
    throw new Error(
      `no step named '${name}' in this phase (have: ${steps.map((s) => s.name).join(', ')}).`,
    );
  }
  return i;
}

/** A copy of `steps` with `added` placed before the step called `name`. Throws on an unknown name. */
export function insertBefore<TCtx extends StepContext<any, any>>(
  steps: readonly PhaseStep<TCtx>[],
  name: string,
  ...added: PhaseStep<TCtx>[]
): PhaseStep<TCtx>[] {
  const i = indexOf(steps, name);
  return [...steps.slice(0, i), ...added, ...steps.slice(i)];
}

/** A copy of `steps` with `added` placed after the step called `name`. Throws on an unknown name. */
export function insertAfter<TCtx extends StepContext<any, any>>(
  steps: readonly PhaseStep<TCtx>[],
  name: string,
  ...added: PhaseStep<TCtx>[]
): PhaseStep<TCtx>[] {
  const i = indexOf(steps, name);
  return [...steps.slice(0, i + 1), ...added, ...steps.slice(i + 1)];
}

/** A copy of `steps` with the step called `name` swapped for `replacement`. Throws on an unknown name. */
export function replaceStep<TCtx extends StepContext<any, any>>(
  steps: readonly PhaseStep<TCtx>[],
  name: string,
  replacement: PhaseStep<TCtx>,
): PhaseStep<TCtx>[] {
  const i = indexOf(steps, name);
  return [...steps.slice(0, i), replacement, ...steps.slice(i + 1)];
}

/** A copy of `steps` without the step called `name`. Throws on an unknown name. */
export function removeStep<TCtx extends StepContext<any, any>>(
  steps: readonly PhaseStep<TCtx>[],
  name: string,
): PhaseStep<TCtx>[] {
  const i = indexOf(steps, name);
  return [...steps.slice(0, i), ...steps.slice(i + 1)];
}

const isAnimation = (value: unknown): value is gsap.core.Animation =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as gsap.core.Animation).kill === 'function' &&
  typeof (value as gsap.core.Animation).then === 'function';

const isCancellable = (value: unknown): value is Cancellable =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Cancellable).cancel === 'function' &&
  (value as Cancellable).done instanceof Promise;

/**
 * Run one step with the cancel semantics the built-in phases use: a returned
 * animation is killed on cancel, a cancellable is cancelled, a promise is
 * aborted through `ctx.signal`, and `done` settles either way. Public so a
 * custom phase can run a step of its own the same way. Pass `controller`
 * when `ctx.wait` / `ctx.until` must abort on the same signal.
 */
export function runStep<TCtx extends StepContext<any, any>>(
  run: (ctx: TCtx) => StepResult,
  ctx: Omit<TCtx, 'signal'>,
  controller: AbortController = new AbortController(),
): RunningStep {
  let settled = false;
  let settle: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
  });

  const result = run({ ...ctx, signal: controller.signal } as TCtx);
  let cancelInner: (() => void) | null = null;
  if (isCancellable(result)) {
    cancelInner = () => result.cancel();
    void result.done.then(() => settle());
  } else if (isAnimation(result)) {
    cancelInner = () => result.kill();
    // A killed animation never resolves its own promise; `cancel` settles.
    void result.then(() => settle());
  } else if (result && typeof (result as Promise<void>).then === 'function') {
    (result as Promise<void>).then(settle, settle);
  } else {
    settle();
  }

  return {
    done,
    get settled() {
      return settled;
    },
    cancel: () => {
      const inner = cancelInner;
      cancelInner = null;
      inner?.();
      if (!controller.signal.aborted) controller.abort();
      settle();
    },
  };
}
