# ADR 021: A speed profile is sectioned by phase, not flattened

## Status: Accepted, implemented on `feat/profile-phase-step-config`

## Context

A `SpeedProfile` is one flat bag of numbers and every phase picks out the
fields it happens to care about. `accelerationEase` and `accelerationDuration`
exist for one step of one phase, and nothing in the profile says so.

Two things that shape cannot express, both of which games ask for.

**Steps are not addressable.** A phase runs a named list of steps and a game
may insert, replace or remove one — but that is code. The profile, the thing
`setSpeed('turbo')` swaps at run time, has no way to say "the bounce eases
differently in turbo". A step added to a built-in phase is doubly unreachable:
no field for it, and no name to hang one on.

**"The same phase, but after a tease" has nowhere to live.** A reel that teased
should land differently from one that did not. The only lever was
`StopPhaseConfig.preserveSpeed`, which the controller sets and a game cannot
see: `didAnticipate` was a local in `SpinController`, and by the time
`PhaseFactory.create('stop', ...)` ran, the fact was gone.

## Decision

**The flat fields stay as they are and become the base layer.** They are the
profile's contract; breaking them for a tidier shape would invalidate every
profile in every game for a cosmetic gain. This also settles where a field
belongs: nowhere new. `spinSpeed` inside `start` is the same `spinSpeed`.

**On top of them, one optional section per phase, keyed by registered name:**

```ts
stop: {
  bounceDistance: 40,                          // flat fields, this phase only
  steps: { bounce: { ease: 'power1.out' } },   // per-step, by step name
  whenAnticipated: {                           // the same, for a reel that teased
    steps: { bounce: { ease: 'sine.out' } },
  },
}
```

Resolution, lowest first: flat field → `profile[phase]` →
`profile[phase].whenAnticipated` (only when the reel teased) → a run-time
`speed.tune()`. `ReelPhase.timing` is the result, and the built-in phases read
it instead of `this._speed`. A profile with no section for a phase resolves to
itself by identity, so the common path allocates nothing.

### Why `whenAnticipated` nests, rather than an `'anticipation:stop'` key

`colon:name` is already taken: `cascade:fall`, `cascade:place`,
`cascade:dropIn` are phase NAMES in `PhaseFactory`. One syntax, two meanings,
told apart by a parser that has to know the built-in list. Nesting cannot
collide with a phase name and types itself with no key parsing. It
deliberately does not nest further; a variant of a variant has no meaning
here.

### Why a registry interface, not a generic profile

For a custom phase's section to be typed rather than `object`, the type system
has to know the phase exists. A generic `SpeedProfile<TPhases>` is correct and
local, but the parameter threads through `SpeedManager`, `SpinController`,
`PhaseFactory` and `ReelPhase` — three type parameters on `ReelPhase` to
describe one object. A registry interface a game merges into (`PhaseProfiles`)
is app-global, which is a real limitation, but costs no type parameters and
autocompletes the phase names. A game with two reel sets and conflicting phase
names is hypothetical; a game with custom phases is every game.

So `SpeedProfile` becomes `SpeedProfileBase & PhaseSections`. An intersection
is still extensible by `interface MyProfile extends SpeedProfile`, which the
phase contract documents. An index signature was rejected outright: it types
every custom section as `unknown` AND disables excess-property checking on the
flat fields, which is where the typos are.

### Why the anticipated flag is a create-time context

`PhaseFactory.create` gains a `PhaseCreateContext` — `phase`, `reelIndex`,
`anticipated`, `quickened` — passed to the registered factory and attached to
the instance. The factory needs it at create time: the stated use is deciding
whether to build a custom anticipation phase for a given reel, and an event
would arrive after the decision.

`anticipated` means "this reel ran a tease TO ITS END earlier in this spin".
False for the tease itself, so `anticipation.whenAnticipated` is not a
tautology; and false for a tease a `'quicken'` press cut short, because what
the press cut is the tease the variant exists to pay off. That is deliberately
NOT the `preserveSpeed` condition (`didAnticipate && !quickened`): that one is
about speed continuity into the spin-out, and a press landing after a tease
has fully played should not undo a landing the tease earned. `quickened` sits
beside `anticipated` in the context, so a phase that wants the other reading
can take it.

## Consequences

- Profiles written before this release resolve to themselves: no allocation,
  no behaviour change.
- A section may restate any flat field, including ones its phase never reads
  (`stop: { anticipationDelay: 1 }` is legal and inert). Constraining each
  section to "its" fields would mean assigning ownership of `spinSpeed`, which
  four phases read, and would break the same-name-same-meaning rule.
- The built-in steps read `ctx.step[0]`. A list is for a step written to
  consume segments.
- `PhaseProfiles` is app-global; two reel sets share the namespace.
- `speed.tune()` takes effect on the next spin, because the controller
  captures `speedManager.active` once per spin. That is the existing rule for
  `setSpeed`, not a new one.
