# ADR 020: Anticipation should model acceleration, not speed

## Status: Proposed

## Context

`AnticipationPhase` is, in full:

```ts
const duration    = (config.duration ?? speed.anticipationDelay) / 1000;
const targetSpeed = speed.spinSpeed * (config.speedMultiplier ?? 0.3);

this._tween = reel.gsap.timeline();
this._tween.to(reel, { speed: targetSpeed, duration: duration * 0.35, ease: 'power2.out' });
this._tween.to({},    { duration: duration * 0.65, onComplete: () => this._complete() });
```

Everything that shapes the tease sits on top of that shape: `slowdown.from/to`
picks `speedMultiplier` per tease-order, `slowdown.holdFrom/holdTo` scales
`duration`, `stagger` shifts when each reel enters the phase. The *curve itself*
is fixed.

Three consequences, and they are the reasons the tease reads as a setting change
rather than a movement.

**1. `power2.out` on a speed value is a jerk step, not a deceleration.**
`reel.speed` is pixels-per-frame and `Reel.update` integrates it directly. An
ease-out applied to speed means the deceleration is at its maximum on the very
first frame and decays asymptotically — the reel's acceleration jumps from `0`
to its peak instantaneously, then trails off. Physically that is a step in
acceleration, which is exactly what "the speed changed" feels like. A pedal
feels like a pedal because acceleration itself ramps: the curve wanted is
S-shaped (`inOut`), which bounds jerk at both ends.

**2. The tease is 35% motion and 65% dead hold.** After the ramp, the reel runs
at a flat low speed with nothing changing until `StopPhase` takes over. The
tension in the middle of the tease is carried entirely by whatever SFX the game
plays; the reel contributes a constant.

**3. There is no way to speed up.** The phase name is "anticipation" but the
implementation is "decelerate". Nothing in the API expresses "the reel surges,
*then* crawls", which is the shape most modern tease choreography actually uses.
`slowdown.from: 2` would technically be accepted — nothing clamps the multiplier
— and `StopPhase`'s `preserveSpeed` path (`Math.max(reel.speed, spinSpeed * 0.08)`)
would then carry a *faster*-than-normal speed into the spin-out. That is
untested accidental behaviour, not a feature.

Two of these are curve-shape problems, fixable inside the existing tween model.
The third is structural.

## Decision

Three layers, each usable without the next.

### Layer 1 — `curve`: an explicit speed profile

Replace the fixed decel-then-hold with a keyframed list of segments, as a new
field on `AnticipationOptions`:

```ts
interface AnticipationSegment {
  /** Target speed as a multiple of the profile's spinSpeed. `1.8` = surge. */
  speed: number;
  /** ms to reach it from the current speed. */
  duration: number;
  /** GSAP ease for the transition. Default 'power2.inOut'. */
  ease?: string;
  /** ms to hold at this speed after reaching it. Default 0. */
  hold?: number;
}
```

```ts
reelSet.setAnticipation([2, 3, 4], {
  stagger: 'sequential',
  curve: [
    { speed: 1.8,  duration: 220, ease: 'power2.in' },   // surge
    { speed: 0.12, duration: 700, ease: 'power3.inOut', hold: 400 }, // crawl
  ],
});
```

This is a strict superset of `slowdown`: the existing `from/to/holdFrom/holdTo`
sugar keeps working and is defined as compiling down to a two-segment curve with
today's split and ease. `curve` and `slowdown` together is an error, not a merge.

Segments interpolate across tease-order the same way `slowdown` does, so the
per-reel escalation story is unchanged — the last reel's curve is simply the
last reel's curve.

**Default ease changes only inside `curve`.** Existing spins keep `power2.out`
byte-for-byte. Games opting into `curve` get `power2.inOut` as the segment
default, which is the S-shape fix from problem 1.

### Layer 2 — `cells`: anchor the tease to travel, not time

`duration` is a time budget, so how far the reel actually travels during a tease
depends on the speed curve. Two reels teasing with different `slowdown` values
pass a different number of symbols, and the crawl-in length going into
`StopPhase` varies with it.

Add `cells?: number` as an alternative anchor: tease until the reel has
travelled N symbol pitches, whatever that takes. `ReelMotion` already derives
travel exactly (`_travel / _pitch`), so the phase can watch it directly rather
than estimating.

`duration` and `cells` are mutually exclusive. Time is right when the tease is
cut to an audio bed; travel is right when the tease is cut to symbols passing
the window. Both are real production needs, so both ship; neither is the
default for the other.

### Layer 3 — `ReelDrive`: bounded acceleration in the update loop

The structural fix. Instead of tweening `reel.speed`, the reel gets a
*target* speed and integrates toward it under an acceleration bound:

```ts
interface ReelDriveConfig {
  /** Max acceleration, px/frame^2. */
  accel: number;
  /** Max deceleration, px/frame^2. Defaults to accel. */
  decel?: number;
  /** Optional jerk bound, px/frame^3. Unset = acceleration may step. */
  jerk?: number;
}
```

`Reel.update` ramps `speed` toward `targetSpeed` each tick within those bounds.
Phases stop owning a tween and start writing `reel.targetSpeed`.

Why this is better than any ease:

- **It is the gas pedal.** Bounding acceleration (and optionally jerk) is
  literally the physical model the request describes. An ease can only
  approximate one specific transition; a bound holds across every transition,
  including ones nobody scripted.
- **Interruption is free.** A skip press, a mid-tease retarget, or a speed-profile
  change mid-spin currently means killing a timeline and reconciling whatever
  speed it left behind. With a drive you assign a new target and the motion stays
  continuous by construction — no discontinuity to clean up.
- **It is frame-rate independent and testable.** The integrator is a pure
  function of `(speed, target, bounds, dt)`, so it goes under the same
  contract-test treatment as `ReelMotion` (ADR 018), including a golden trace.

Risk, and the mitigation: `StartPhase` and `StopPhase` also tween `reel.speed`.
Two owners of one field is the failure mode. So the drive is **opt-in per set**
(`builder.motionModel('drive')`, default `'tween'`), and when it is off, not one
line of the current path changes. Under `'drive'`, `StartPhase`'s accel ramp and
`StopPhase`'s `preserveSpeed` floor both become target assignments, and the
`Math.max(reel.speed, spinSpeed * 0.08)` floor — which exists only to stop a
`slowdown.to: 0` curve stalling the spin-out — becomes unnecessary, because a
drive that is asked for zero and then asked for the stop speed simply ramps
there.

### Supporting change: expose speed for audio

Every game hand-rolls a pitch-ramping tease loop and has nothing to drive it
from. Add `reel.speedNormalized` (current speed / profile spin speed) as a
read-only getter. No event, no throttle policy, no allocation — audio code is
already on a ticker and can sample it. `anticipation:reel` /
`anticipation:reelEnd` stay as the discrete bookends.

## Consequences

- Three shippable increments, in order of value-per-risk: `curve` (contained,
  additive, fixes the felt problem for most games), `cells` (small, needs a
  travel hook in the phase), `ReelDrive` (largest, gated behind an opt-in).
- `curve` makes speed-**up** teases a supported, tested path rather than an
  accident. `StopPhase`'s `preserveSpeed` needs an explicit answer for
  above-normal entry speed: cap at `spinSpeed` on entry, so a surge cannot leak
  into the spin-out.
- The drive integrator is new physics in the hot loop and inherits ADR 018's
  standard: laws plus golden traces, mutation-verified, not just green tests.
- `AnticipationPhase` currently splits its duration 35/65. Under `curve` that
  split disappears, so anything that visually depended on it — a game timing an
  SFX to the end of the ramp — changes shape. It is opt-in, so this is a
  documentation obligation, not a break.
