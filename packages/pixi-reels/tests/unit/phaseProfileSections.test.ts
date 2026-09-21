/**
 * Per-phase sections on a speed profile.
 *
 * What has to hold: a profile with no sections resolves to itself, so every
 * profile written before sections existed behaves exactly as it did; a
 * section's flat fields win over the profile's for that phase alone; a
 * `whenAnticipated` half applies only to a reel that teased; per-step config
 * reaches the step that owns it, one segment or several; a run-time `tune`
 * merges into the section without flattening the rest of it; and a
 * registered factory is told which reel it is building for and whether that
 * reel teased.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { StopPhase } from '../../src/spin/phases/StopPhase.js';
import type { StopStepContext } from '../../src/spin/phases/StopPhase.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import type { BounceContext } from '../../src/spin/phases/ReelPhase.js';
import { SpeedManager } from '../../src/speed/SpeedManager.js';
import { step, replaceStep } from '../../src/spin/phases/steps.js';
import { resolvePhaseProfile, resolveStepTiming } from '../../src/config/phaseProfile.js';
import type { PhaseCreateContext } from '../../src/spin/phases/ReelPhase.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';
import type { PhaseSection, SpeedProfile, StepTiming } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

// A game's own phase, declared the way a game declares one: the section it
// adds is typed here and everywhere else a profile is written. Tests are not
// in the typecheck program, so what this file asserts is the runtime half.
// the typed half shows up as an editor error on a wrong field.
declare module '../../src/config/types.js' {
  interface PhaseProfiles {
    'bigwin:flash': PhaseSection<{ pulse: StepTiming }, { flashes: number }>;
  }
}

const FLAT: SpeedProfile = {
  name: 'flat',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 12,
  bounceDuration: 200,
  accelerationDuration: 60,
  minimumSpinTime: 0,
};

const SECTIONED: SpeedProfile = {
  ...FLAT,
  name: 'sectioned',
  anticipationDelay: 60,
  stop: {
    bounceDuration: 100,
    steps: { bounce: { ease: 'power1.out' } },
    whenAnticipated: {
      bounceDistance: 4,
      steps: { bounce: { ease: 'sine.out', duration: 40 } },
    },
  },
};

const RESULT = [{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'b', 'b'] }];

function build(
  phases: (f: PhaseFactory) => void,
  profile: SpeedProfile,
): { reelSet: ReelSet; ticker: FakeTicker } {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(2)
    .visibleCells(3)
    .symbolSize(80, 80)
    .symbols((r) => {
      r.register('a', HeadlessSymbol, {});
      r.register('b', HeadlessSymbol, {});
    })
    .speed(profile.name, profile)
    .initialSpeed(profile.name)
    .phases(phases)
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, ticker };
}

/** Pump frames until `p` settles. */
async function pump(ticker: FakeTicker, p: Promise<unknown>, onTick?: () => void): Promise<void> {
  let done = false;
  void p.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let frame = 0; frame < 5000 && !done; frame++) {
    ticker.tick(16);
    onTick?.();
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!done) throw new Error('spin never settled');
}

describe('resolvePhaseProfile', () => {
  it('returns a profile with no section for the phase unchanged', () => {
    expect(resolvePhaseProfile(FLAT, 'stop')).toBe(FLAT);
  });

  it("folds the phase's own section over the flat fields", () => {
    const resolved = resolvePhaseProfile(SECTIONED, 'stop');
    expect(resolved.bounceDuration).toBe(100);
    // Untouched by the section, so still the profile's own.
    expect(resolved.bounceDistance).toBe(12);
    expect(resolved.spinSpeed).toBe(30);
  });

  it('leaves other phases reading the profile-wide values', () => {
    expect(resolvePhaseProfile(SECTIONED, 'start').bounceDuration).toBe(200);
  });

  it('folds whenAnticipated over the section only for a reel that teased', () => {
    expect(resolvePhaseProfile(SECTIONED, 'stop', false).bounceDistance).toBe(12);
    expect(resolvePhaseProfile(SECTIONED, 'stop', true).bounceDistance).toBe(4);
    // The section's own field stands where the variant says nothing.
    expect(resolvePhaseProfile(SECTIONED, 'stop', true).bounceDuration).toBe(100);
  });

  it('ignores a field explicitly set to undefined rather than blanking the profile', () => {
    const profile: SpeedProfile = { ...FLAT, stop: { bounceDistance: undefined } };
    expect(resolvePhaseProfile(profile, 'stop').bounceDistance).toBe(12);
  });
});

describe('resolveStepTiming', () => {
  it('is empty when the profile says nothing about the step', () => {
    expect(resolveStepTiming(FLAT, 'stop', 'bounce')).toEqual([]);
    expect(resolveStepTiming(SECTIONED, 'stop', 'land')).toEqual([]);
  });

  it('reads a single object as one segment', () => {
    expect(resolveStepTiming(SECTIONED, 'stop', 'bounce')).toEqual([{ ease: 'power1.out' }]);
  });

  it('reads a list as its segments, in order', () => {
    const profile: SpeedProfile = {
      ...FLAT,
      anticipation: { steps: { tease: [{ duration: 100 }, { duration: 300, ease: 'sine.out' }] } },
    };
    expect(resolveStepTiming(profile, 'anticipation', 'tease')).toEqual([
      { duration: 100 },
      { duration: 300, ease: 'sine.out' },
    ]);
  });

  it("merges whenAnticipated's entry over the section's, segment by segment", () => {
    expect(resolveStepTiming(SECTIONED, 'stop', 'bounce', true)).toEqual([
      { ease: 'sine.out', duration: 40 },
    ]);
  });
});

describe('a custom phase declared into PhaseProfiles', () => {
  it('carries a section with a real type, checked field by field', () => {
    const profile: SpeedProfile = {
      ...FLAT,
      'bigwin:flash': { flashes: 3, steps: { pulse: { duration: 120 } } },
    };
    // `flashes` is the section's own field, `pulse` one of its steps: both
    // are typed, not `object`, and resolve like any built-in section.
    expect(profile['bigwin:flash']?.flashes).toBe(3);
    expect(resolveStepTiming(profile, 'bigwin:flash', 'pulse')).toEqual([{ duration: 120 }]);
  });
});

describe('SpeedManager.tune', () => {
  const manager = (): SpeedManager =>
    new SpeedManager(
      new Map([
        ['sectioned', SECTIONED],
        ['flat', FLAT],
      ]),
      'sectioned',
    );

  it('leaves the active profile alone until something is tuned', () => {
    expect(manager().active).toBe(SECTIONED);
  });

  it('merges into the section without dropping what it already said', () => {
    const speed = manager();
    speed.tune('stop', { steps: { bounce: { duration: 25 } } });
    expect(resolveStepTiming(speed.active, 'stop', 'bounce')).toEqual([
      { ease: 'power1.out', duration: 25 },
    ]);
    // The section's flat field and its anticipated half are untouched.
    expect(resolvePhaseProfile(speed.active, 'stop').bounceDuration).toBe(100);
    expect(resolvePhaseProfile(speed.active, 'stop', true).bounceDistance).toBe(4);
  });

  it('does not mutate the registered profile', () => {
    const speed = manager();
    speed.tune('stop', { bounceDuration: 10 });
    expect(SECTIONED.stop?.bounceDuration).toBe(100);
    expect(speed.getProfile('sectioned')).toBe(SECTIONED);
  });

  it('is a layer on top of whichever profile is active', () => {
    const speed = manager();
    speed.tune('stop', { bounceDuration: 10 });
    speed.set('flat');
    expect(resolvePhaseProfile(speed.active, 'stop').bounceDuration).toBe(10);
  });

  it('clears one phase, or all of them', () => {
    const speed = manager();
    speed.tune('stop', { bounceDuration: 10 });
    speed.tune('start', { spinDelay: 99 });
    speed.clearTune('stop');
    expect(resolvePhaseProfile(speed.active, 'stop').bounceDuration).toBe(100);
    expect(resolvePhaseProfile(speed.active, 'start').spinDelay).toBe(99);
    speed.clearTune();
    expect(speed.active).toBe(SECTIONED);
  });
});

describe('a section reaching the phase that owns it', () => {
  it('gives each reel the step config its own history selects', async () => {
    const seen = new Map<number, { step: readonly StepTiming[]; anticipated: boolean; duration: number }>();
    const { reelSet, ticker } = build(
      (f) =>
        f.register('stop', StopPhase, {
          steps: (steps) =>
            replaceStep(
              steps,
              'bounce',
              step('bounce', (ctx) => {
                seen.set(ctx.reel.reelIndex, {
                  step: ctx.step,
                  anticipated: ctx.anticipated,
                  duration: ctx.profile.bounceDuration,
                });
              }),
            ),
        }),
      SECTIONED,
    );

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.setAnticipation([1]);
    await pump(ticker, spin);

    // Reel 0 never teased: the section's own half.
    expect(seen.get(0)).toEqual({
      step: [{ ease: 'power1.out' }],
      anticipated: false,
      duration: 100,
    });
    // Reel 1 teased: whenAnticipated merged over it.
    expect(seen.get(1)).toEqual({
      step: [{ ease: 'sine.out', duration: 40 }],
      anticipated: true,
      duration: 100,
    });

    reelSet.destroy();
    ticker.destroy();
  });

  it('tells a registered factory which reel it is building for, and whether it teased', async () => {
    const contexts: PhaseCreateContext[] = [];
    const { reelSet, ticker } = build(
      (f) =>
        f.registerFactory('stop', (reel, speed, ctx) => {
          contexts.push(ctx);
          return new StopPhase(reel, speed);
        }),
      SECTIONED,
    );

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.setAnticipation([1]);
    await pump(ticker, spin);

    expect(contexts.map((c) => ({ phase: c.phase, reel: c.reelIndex, teased: c.anticipated }))).toEqual([
      { phase: 'stop', reel: 0, teased: false },
      { phase: 'stop', reel: 1, teased: true },
    ]);

    reelSet.destroy();
    ticker.destroy();
  });
});

describe('the bounce ease is profile data', () => {
  /** Capture what `bounce()` resolved the ease to, through a custom animation. */
  function easeProbe(profile: SpeedProfile, options: { ease?: string } = {}) {
    const eases: string[] = [];
    const built = build(
      (f) =>
        f.register('stop', StopPhase, {
          steps: (steps) =>
            replaceStep(
              steps,
              'bounce',
              step('bounce', (ctx) =>
                ctx.phase.bounce({
                  ...options,
                  animation: (bounce: BounceContext) => {
                    eases.push(bounce.ease);
                    return ReelPhase.defaultBounce(bounce);
                  },
                }),
              ),
            ),
        }),
      profile,
    );
    return { ...built, eases };
  }

  it("falls back to 'power1.out' when the profile says nothing", async () => {
    const { reelSet, ticker, eases } = easeProbe(FLAT);
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    expect(eases).toEqual(['power1.out', 'power1.out']);
    reelSet.destroy();
    ticker.destroy();
  });

  it("reads the profile's bounceEase", async () => {
    const { reelSet, ticker, eases } = easeProbe({ ...FLAT, bounceEase: 'sine.out' });
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    expect(eases).toEqual(['sine.out', 'sine.out']);
    reelSet.destroy();
    ticker.destroy();
  });

  it('lets a call-site ease win over the profile', async () => {
    const { reelSet, ticker, eases } = easeProbe(
      { ...FLAT, bounceEase: 'sine.out' },
      { ease: 'back.out(2)' },
    );
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    expect(eases).toEqual(['back.out(2)', 'back.out(2)']);
    reelSet.destroy();
    ticker.destroy();
  });

  it("is sectionable like any other flat field, including whenAnticipated", () => {
    const profile: SpeedProfile = {
      ...FLAT,
      bounceEase: 'power1.out',
      stop: { bounceEase: 'sine.out', whenAnticipated: { bounceEase: 'back.out(2)' } },
    };
    expect(resolvePhaseProfile(profile, 'start').bounceEase).toBe('power1.out');
    expect(resolvePhaseProfile(profile, 'stop').bounceEase).toBe('sine.out');
    expect(resolvePhaseProfile(profile, 'stop', true).bounceEase).toBe('back.out(2)');
  });
});

describe('a subclass of a built-in phase', () => {
  interface TeaseProfile extends SpeedProfile {
    readonly teasedEase: string;
  }

  it('reads its own profile type through ctx.profile, with no cast', async () => {
    const seen: string[] = [];
    class TeasedStop extends StopPhase<TeaseProfile> {
      override defaultSteps() {
        return replaceStep(
          super.defaultSteps(),
          'bounce',
          step<StopStepContext<TeaseProfile>>('bounce', (ctx) => {
            // The point of the test: `teasedEase` is not on `SpeedProfile`.
            seen.push(ctx.profile.teasedEase);
          }),
        );
      }
    }

    const profile: TeaseProfile = { ...FLAT, name: 'teased', teasedEase: 'sine.out' };
    const { reelSet, ticker } = build(
      (f) => f.registerFactory('stop', (reel, speed: TeaseProfile) => new TeasedStop(reel, speed)),
      profile,
    );
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    expect(seen).toEqual(['sine.out', 'sine.out']);
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('a tease a press cut short does not count as one', () => {
  it('leaves the reel on the section\'s own half, not whenAnticipated', async () => {
    const seen = new Map<number, boolean>();
    const profile: SpeedProfile = { ...SECTIONED, name: 'longTease', anticipationDelay: 400 };
    const { reelSet, ticker } = build(
      (f) =>
        f.register('stop', StopPhase, {
          steps: (steps) =>
            replaceStep(
              steps,
              'bounce',
              step('bounce', (ctx) => {
                seen.set(ctx.reel.reelIndex, ctx.anticipated);
              }),
            ),
        }),
      profile,
    );

    // Press on the frame AFTER reel 1's tease starts, so the press reaches
    // the anticipation phase and cuts it mid-flight.
    let teasing = false;
    let pressed = false;
    reelSet.events.on('anticipation:reel', () => {
      teasing = true;
    });

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.setAnticipation([1]);
    await pump(ticker, spin, () => {
      if (!teasing || pressed) return;
      pressed = true;
      reelSet.requestSkip({ mode: 'quicken' });
    });

    expect(pressed).toBe(true);
    expect(seen.get(0)).toBe(false);
    // Teased, but the press cut the tease: the landing is the regular one.
    expect(seen.get(1)).toBe(false);

    reelSet.destroy();
    ticker.destroy();
  });
});
