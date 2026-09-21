---
'pixi-reels': minor
---

Add: per-phase sections on a speed profile, so a phase's timing, its steps, and its anticipated variant are configured where they belong instead of in one flat bag.

A profile's flat fields are unchanged and still the contract: a phase that read `profile.spinSpeed` reads exactly what it always did, and every profile written before this release behaves identically. On top of them a profile may now carry one optional section per phase:

```ts
const normal = {
  name: 'normal',
  spinDelay: 0,
  spinSpeed: 200,
  stopDelay: 140,
  anticipationDelay: 450,
  bounceDistance: 80,
  bounceDuration: 600,
  start: { steps: { accelerate: { ease: 'sine.out', duration: 300 } } },
  stop: {
    bounceDistance: 40,
    whenAnticipated: { steps: { bounce: { ease: 'sine.out' } } },
  },
} satisfies SpeedProfile;
```

A section restates any flat field for that phase alone, configures the phase's named steps by name, and carries a `whenAnticipated` half that is merged on top for a reel that teased earlier in the spin. Nesting rather than a `'anticipation:stop'` key keeps the variant distinct from a phase NAME like `'cascade:fall'`.

**Custom phases are typed, not `object`.** `PhaseProfiles` is the registry the built-in sections live in, and a game merges its own phases into it:

```ts
declare module 'pixi-reels' {
  interface PhaseProfiles {
    'bigwin:flash': PhaseSection<{ pulse: StepTiming }, { flashes: number }>;
  }
}
```

That section is then checked and autocompleted everywhere a profile is written, and a typo in a step name is a compile error.

**A phase can tell whether its reel teased.** `PhaseFactory.create` now passes a `PhaseCreateContext` (`phase`, `reelIndex`, `anticipated`, `quickened`) as a third argument to a registered factory, so a registration can build a different phase for a reel that teased:

```ts
f.registerFactory('anticipation', (reel, speed, ctx) =>
  ctx.reelIndex === 4 ? new CustomAnticipationPhase(reel, speed) : new AnticipationPhase(reel, speed));
```

The same context reaches the phase: `phase.anticipated`, and `ctx.anticipated` in every step.

Also new: `ReelPhase.timing` (the profile with this phase's section folded in — what the built-in phases now read), `ctx.step` in a step (that step's config from the profile, in segment order), `resolvePhaseProfile` / `resolveStepTiming` for a phase that does not extend `ReelPhase`, and `speed.tune(phase, section)` / `speed.clearTune()` to override part of a section at run time. Like a speed change, a tune takes effect on the next spin.

**The built-in phases are generic over their profile.** `StopPhase<TProfile>`, and the same for the other seven, so subclassing one keeps the profile type instead of pinning it back to `SpeedProfile`. A subclass reads its own fields through `this._speed` and `ctx.profile` with no cast:

```ts
class TeasedStop extends StopPhase<MyProfile> {
  override defaultSteps(): PhaseStep<StopStepContext<MyProfile>>[] { /* ctx.profile.myField */ }
}
```

`StopPhase` with no argument is `StopPhase<SpeedProfile>`, exactly as before, and `f.register('stop', StopPhase, { steps })` infers as before — `register` now reads its options type off the class (`PhaseOptionsOf`) so it works for a generic one.

**`bounceEase` is a profile field.** The third of the bounce's three numbers, beside `bounceDistance` and `bounceDuration`, read by `phase.bounce()` when the call names no ease. `bounce({ ease })` still wins; with neither it is `'power1.out'` as today. Being a flat field it sections like the rest, so a teased landing that differs only in its ease is `stop: { whenAnticipated: { bounceEase: 'sine.out' } }` and no phase code.

`anticipated` means a tease that RAN TO ITS END. A `'quicken'` press that cuts a tease short leaves the reel on the section's own half rather than `whenAnticipated`: the press asked for the landing, and what it cut is the tease the variant exists to pay off. A press before the tease skips it outright, as it already did. `quickened` is in the same context, so a phase that wants the other reading can take it.

**Deprecate: `decelerationEase`.** It is declared, set in all three built-in presets, and read nowhere in the engine — it names a deceleration phase that does not exist (a stop is a spin-out plus a bounce) while being the first place a consumer looks for the landing ease. It still compiles and still does nothing; the typings now say so and point at `bounceEase`. Removed in the next major.

**One thing that can break a consumer:** `SpeedProfile` is now `SpeedProfileBase & PhaseSections` rather than a lone interface, so it can no longer be extended by declaration merging. `interface MyProfile extends SpeedProfile { ... }` is unaffected and stays the documented way to carry extra timing. If you were merging into the library's own interface, merge into `SpeedProfileBase` instead:

```ts
// before
declare module 'pixi-reels' { interface SpeedProfile { houseEase: string } }
// after
declare module 'pixi-reels' { interface SpeedProfileBase { houseEase: string } }
```

A profile carrying a top-level OBJECT field named after a phase (`start`, `spin`, `anticipation`, `stop`, `adjust`, `cascade:*`) now collides with that phase's section and fails to compile, loudly, at the profile's declaration. Rename the field, or make it the phase's section.

