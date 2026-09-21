/**
 * Compile-time probes for what this release can break.
 *
 * Nothing runs. Every claim is an `@ts-expect-error` where a break is
 * asserted, or a plain declaration where compatibility is asserted, so the
 * file passing `tsc` means every claim holds EXACTLY: a break that stopped
 * happening fails as an unused directive, and a compatibility that stopped
 * holding fails as an error.
 */
import type { Reel } from '../../src/core/Reel.js';
import type {
  SpeedProfile,
  SpeedProfileBase,
  StepTiming,
} from '../../src/config/types.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';
import { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import { StopPhase } from '../../src/spin/phases/StopPhase.js';
import type { StopPhaseConfig, StopStepContext } from '../../src/spin/phases/StopPhase.js';
import type { PhaseCreatorFn } from '../../src/spin/phases/PhaseFactory.js';
import { runStep, step, replaceStep } from '../../src/spin/phases/steps.js';
import type { PhaseStep, StepContext } from '../../src/spin/phases/steps.js';

const FLAT = {
  name: 'flat',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 12,
  bounceDuration: 200,
} satisfies SpeedProfile;

// ── A. the documented way to carry extra timing still works ──────────────
interface HouseProfile extends SpeedProfile {
  readonly houseEase: string;
}
export const house: HouseProfile = { ...FLAT, houseEase: 'sine.out' };

// ── B. SpeedProfile can no longer be merged into: see
//      `speedProfileMerge.types.ts`, which must NOT compile. Merging it here
//      would report the duplicate against `config/types.ts` and poison this
//      whole program, which is itself the point.

// ── C. the base interface still merges, which is the migration path ──────
declare module '../../src/config/types.js' {
  interface SpeedProfileBase {
    readonly houseSfx?: string;
  }

  // ── C2. a step INSERTED into a built-in phase is declared the same way,
  //        and its config is whatever the entry says, not only a StepTiming.
  interface StopSteps {
    kick: { lift: number; ease?: string };
  }
}
export const insertedStep: SpeedProfile = {
  ...FLAT,
  stop: {
    steps: { kick: { lift: 14, ease: 'back.out(2)' } },
    whenAnticipated: { steps: { kick: { lift: 28 } } },
  },
};
export const insertedStepTypo: SpeedProfile = {
  ...FLAT,
  // @ts-expect-error `lift` is a number, and the step's own shape is checked.
  stop: { steps: { kick: { lift: 'high' } } },
};
export const unknownStepName: SpeedProfile = {
  ...FLAT,
  // @ts-expect-error no step is called `bonce`; the closed set still closes.
  stop: { steps: { bonce: { ease: 'sine.out' } } },
};
export const merged: SpeedProfile = { ...FLAT, houseSfx: 'reel-loop' };

// ── D. an object field named after a phase collides with its section ─────
// @ts-expect-error `spin` is a phase name, so the profile already owns that key.
interface CollidingProfile extends SpeedProfile {
  readonly spin: { readonly sfx: string };
}
export type Colliding = CollidingProfile;

// ── E. …and so does a SCALAR field with a phase's name ───────────────────
// @ts-expect-error same key, still the profile's, whatever the value's type.
interface ScalarCollision extends SpeedProfile {
  readonly stop: number;
}
export type Scalar = ScalarCollision;

// ── F. a field named after NO phase is untouched ─────────────────────────
interface FreeField extends SpeedProfile {
  readonly teasedBounce: { readonly ease: string };
}
export const free: FreeField = { ...FLAT, teasedBounce: { ease: 'sine.out' } };

// ── G. a typo in a profile is still caught ───────────────────────────────
export const typo: SpeedProfile = {
  ...FLAT,
  // @ts-expect-error excess-property checking still bites.
  bounceDistanc: 1,
};

// ── H. bounceEase, flat and sectioned ────────────────────────────────────
export const eased: SpeedProfile = {
  ...FLAT,
  bounceEase: 'power1.out',
  stop: { bounceEase: 'sine.out', whenAnticipated: { bounceEase: 'back.out(2)' } },
};

// ── I. decelerationEase is deprecated, NOT removed ───────────────────────
export const deprecated: SpeedProfile = { ...FLAT, decelerationEase: 'power2.out' };
export const stillOnPresets: string | undefined = SpeedPresets.NORMAL.decelerationEase;

// ── J. a bare built-in phase is what it always was ───────────────────────
export type BareStop = StopPhase;
class PlainSubclass extends StopPhase {}
export type PlainIsDefaulted = PlainSubclass extends StopPhase<SpeedProfile> ? true : never;
export const plainIsDefaulted: PlainIsDefaulted = true;

// ── K. register still infers the step editor's parameter ─────────────────
const factory = new PhaseFactory();
factory.register('stop', StopPhase, {
  // `steps` must be typed, not implicitly `any` (noImplicitAny catches it).
  steps: (steps) => replaceStep(steps, 'bounce', step('bounce', (ctx) => ctx.phase.bounce())),
});

// ── L. a phase declared against a wider profile registers with no cast ───
class WiderStop extends ReelPhase<StopPhaseConfig, HouseProfile> {
  readonly name = 'stop';
  readonly skippable = true;
  protected onEnter(): void {
    const ease: string = this._speed.houseEase;
    void ease;
  }
  update(): void {}
  protected onSkip(): void {}
}
factory.register('stop', WiderStop);

// ── M. a generic subclass keeps its profile through ctx ──────────────────
class TypedStop extends StopPhase<HouseProfile> {
  override defaultSteps(): PhaseStep<StopStepContext<HouseProfile>>[] {
    return replaceStep(
      super.defaultSteps(),
      'bounce',
      step<StopStepContext<HouseProfile>>('bounce', (ctx) =>
        ctx.phase.bounce({ ease: ctx.profile.houseEase }),
      ),
    );
  }
}
factory.registerFactory('stop', (reel, speed: HouseProfile) => new TypedStop(reel, speed));

// ── N. explicit type arguments on register no longer fit ─────────────────
// @ts-expect-error `register` takes one type parameter now, not three.
factory.register<SpeedProfile, StopPhase, undefined>('stop', StopPhase);

// ── O. a stored creator fn is called with the context ────────────────────
declare const creator: PhaseCreatorFn;
declare const someReel: Reel;
// @ts-expect-error the third argument is required of a caller.
creator(someReel, FLAT);
export const created = creator(someReel, FLAT, {
  phase: 'stop',
  reelIndex: 0,
  anticipated: false,
  quickened: false,
});

// ── P. runStep still accepts a hand-built context ────────────────────────
declare const handRolled: Omit<StepContext<StopPhaseConfig>, 'signal' | 'step' | 'anticipated'>;
export const running = runStep<StopStepContext>(() => {}, handRolled);

// ── Q. …but writing the context type out now needs both fields ───────────
// @ts-expect-error `step` and `anticipated` are part of the context.
export const literal: StepContext<StopPhaseConfig> = handRolled;

// ── R. a step's own config is typed, not `object` ────────────────────────
export const readsStep = step<StopStepContext>('bounce', (ctx) => {
  const timing: StepTiming | undefined = ctx.step.at(0);
  const teased: boolean = ctx.anticipated;
  void timing;
  void teased;
});

// `SpeedProfileBase` is nameable, which is what makes the migration writable.
export type Base = SpeedProfileBase;
