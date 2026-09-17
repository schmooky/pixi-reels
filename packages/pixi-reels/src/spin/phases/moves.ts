import type { gsap } from 'gsap';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { Gsap } from '../../utils/gsap.js';

/**
 * What every move receives. A move is one animated beat of a built-in
 * phase, handed out so a game can replace the beat without replacing the
 * phase: the step-back pull and the acceleration of `StartPhase`, the bounce
 * of `StopPhase`, the slow-down of the legacy `AnticipationPhase` tease.
 */
export interface MoveContext {
  reel: Reel;
  /** The profile the phase runs on. */
  profile: SpeedProfile;
  gsap: Gsap;
  /**
   * Aborted when a slam or a destroy cuts the move short. A move that returns
   * a promise stops its own work on it; a returned gsap animation is killed
   * for it.
   */
  signal: AbortSignal;
}

/** `StartPhase`: the brief reverse before launch. */
export interface PullMoveContext extends MoveContext {
  /** Speed to pull back to, px/frame, negative. */
  pullSpeed: number;
  /** Length of the pull in ms. */
  duration: number;
}

/** `StartPhase`: rest (or the pull) to full spin speed. */
export interface AccelerateMoveContext extends MoveContext {
  /** Full spin speed of the profile, px/frame. */
  targetSpeed: number;
  /** `accelerationDuration` in ms. */
  duration: number;
  /** `accelerationEase`. */
  ease: string;
}

/** `StopPhase` (and `ReelPhase.bounce()`): the landing overshoot. */
export interface BounceMoveContext extends MoveContext {
  /** Overshoot in px, already signed for the reel's direction of travel. */
  distance: number;
  /** Total down-and-back time in ms. */
  duration: number;
  ease: string;
  /** Main-axis coordinate of `reel.container` at rest; return there. */
  base: number;
  /**
   * Call on every frame that moves `reel.container`. Lifted unmask views sit
   * in a layer that does not inherit the reel's offset, and this carries them
   * along; leave it out and they hang motionless while the reel bounces.
   */
  followLifted(): void;
}

/** Legacy `AnticipationPhase` tease: decelerate, then hold. */
export interface SlowdownMoveContext extends MoveContext {
  /** Speed to settle at for the tease, px/frame. */
  targetSpeed: number;
  /** The whole tease in ms; the default spends 35% of it slowing down. */
  duration: number;
}

/**
 * What a move returns: a gsap tween or timeline (killed on cancel), a promise
 * (told to stop through `ctx.signal`), or nothing for a beat that is instant.
 */
export type MoveResult = gsap.core.Animation | Promise<void> | void;

export type Move<TCtx extends MoveContext = MoveContext> = (ctx: TCtx) => MoveResult;

/**
 * The moves a game may replace, by phase and beat. `null` removes the beat:
 * no pull, no bounce, an instant jump to spin speed, a tease with no
 * slow-down. Every beat left out keeps its default from {@link defaultMoves}.
 */
export interface PhaseMoves {
  start?: {
    pull?: Move<PullMoveContext> | null;
    accelerate?: Move<AccelerateMoveContext> | null;
  };
  stop?: {
    bounce?: Move<BounceMoveContext> | null;
  };
  anticipation?: {
    slowdown?: Move<SlowdownMoveContext> | null;
  };
}

/** {@link PhaseMoves} with every beat present, `null` where it was removed. */
export interface ResolvedPhaseMoves {
  start: {
    pull: Move<PullMoveContext> | null;
    accelerate: Move<AccelerateMoveContext> | null;
  };
  stop: {
    bounce: Move<BounceMoveContext> | null;
  };
  anticipation: {
    slowdown: Move<SlowdownMoveContext> | null;
  };
}

/**
 * The built-in beats, exported so a replacement can wrap one (play the
 * default, add a flash) instead of rewriting it.
 */
export const defaultMoves: ResolvedPhaseMoves = {
  start: {
    // Tweens `reel.speed`, not a position, so it needs no axis routing: a
    // negative speed is direction-relative and reads as "backwards for this
    // reel" in any orientation.
    pull: (ctx) =>
      ctx.gsap.to(ctx.reel, {
        speed: ctx.pullSpeed,
        duration: ctx.duration / 1000,
        ease: 'power1.out',
      }),
    accelerate: (ctx) =>
      ctx.gsap.to(ctx.reel, {
        speed: ctx.targetSpeed,
        duration: ctx.duration / 1000,
        ease: ctx.ease,
      }),
  },
  stop: {
    // Both legs share a duration so the down + up motion is symmetric.
    bounce: (ctx) => {
      const leg = ctx.duration / 2000;
      const prop = ctx.reel.axis.mainProp;
      return ctx.gsap
        .timeline()
        .to(ctx.reel.container, {
          [prop]: ctx.base + ctx.distance,
          duration: leg,
          ease: ctx.ease,
          onUpdate: ctx.followLifted,
        })
        .to(ctx.reel.container, {
          [prop]: ctx.base,
          duration: leg,
          ease: ctx.ease,
          onUpdate: ctx.followLifted,
        });
    },
  },
  anticipation: {
    // Decelerate over the first 35% of the hold, sit there for the rest.
    slowdown: (ctx) =>
      ctx.gsap
        .timeline()
        .to(ctx.reel, {
          speed: ctx.targetSpeed,
          duration: (ctx.duration / 1000) * 0.35,
          ease: 'power2.out',
        })
        .to({}, { duration: (ctx.duration / 1000) * 0.65 }),
  },
};

/** Fill `overrides` out against {@link defaultMoves}; `null` keeps meaning "removed". */
export function resolveMoves(overrides: PhaseMoves = {}): ResolvedPhaseMoves {
  const pick = <T>(over: T | null | undefined, fallback: T | null): T | null =>
    over === undefined ? fallback : over;
  return {
    start: {
      pull: pick(overrides.start?.pull, defaultMoves.start.pull),
      accelerate: pick(overrides.start?.accelerate, defaultMoves.start.accelerate),
    },
    stop: {
      bounce: pick(overrides.stop?.bounce, defaultMoves.stop.bounce),
    },
    anticipation: {
      slowdown: pick(overrides.anticipation?.slowdown, defaultMoves.anticipation.slowdown),
    },
  };
}

/** A move in flight, from {@link runMove}. */
export interface RunningMove {
  /** Settles when the move finishes, or right after `cancel()`. Never rejects. */
  readonly done: Promise<void>;
  /** Kill the animation or abort the signal, and settle `done`. Idempotent. */
  cancel(): void;
}

const isAnimation = (value: unknown): value is gsap.core.Animation =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as gsap.core.Animation).kill === 'function' &&
  typeof (value as gsap.core.Animation).then === 'function';

/**
 * Run a move with the cancel semantics the built-in phases use: a returned
 * animation is killed on cancel, a returned promise is aborted through the
 * signal, and `done` settles either way. A `null` move is an instant beat.
 * Public so a custom phase can run its own moves the same way.
 */
export function runMove<TCtx extends MoveContext>(
  move: Move<TCtx> | null,
  ctx: Omit<TCtx, 'signal'>,
): RunningMove {
  if (!move) return { done: Promise.resolve(), cancel: () => {} };

  const controller = new AbortController();
  let settled = false;
  let settle: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
  });

  const result = move({ ...ctx, signal: controller.signal } as TCtx);
  let animation: gsap.core.Animation | null = null;
  if (isAnimation(result)) {
    animation = result;
    // A killed animation never resolves its own promise; `cancel` settles.
    void result.then(() => settle());
  } else if (result && typeof (result as Promise<void>).then === 'function') {
    (result as Promise<void>).then(settle, settle);
  } else {
    settle();
  }

  return {
    done,
    cancel: () => {
      if (animation) {
        animation.kill();
        animation = null;
      }
      if (!controller.signal.aborted) controller.abort();
      settle();
    },
  };
}
