---
'pixi-reels': minor
---

Add: mask primitives beyond the rectangle, and anticipation you can shape.

**Masks.** `RoundedRectMaskStrategy` rounds the whole grid (`scope: 'set'`) or
each reel as its own card (`scope: 'reel'`). `SilhouetteMaskStrategy` rounds the
outline of a jagged pyramid / MultiWays set — every step of the staircase,
concave corners included, with their own radius — instead of forcing you to pick
between notched seams and a bounding box that hides the shape.
`PathMaskStrategy` takes a `(graphics, context) => void` so a one-off custom
mask no longer needs a class. `inset(strategy, px)` shrinks any strategy's
output; `composeMasks(...)` unions several into one mask.

**Fix:** `RectMaskStrategy` ignored `ctx.bleed`, so a warped set combining
`curveBleed(...)` with an explicit `.maskStrategy(new RectMaskStrategy())` clipped
the very overhang the bleed asked for.

**Anticipation.** `setAnticipation(reels, { curve })` replaces the fixed
decelerate-then-hold with explicit speed legs, so a tease can surge above spin
speed before it crawls, and its transitions ramp instead of stepping (segment
eases default to `power2.inOut`). Pass a function of tease order to vary the
curve per reel. `{ cells: n }` ends a tease after N symbols of travel instead of
after a fixed time. `reel.speedNormalized` exposes live speed as a fraction of
spin speed, for tease audio that tracks the slow-down rather than just its
start and end.

**`motionModel('drive', { accel, decel, jerk })`** opts a set into
acceleration-bounded motion: phases set a target speed and the reel integrates
toward it, so every transition is shaped by the bounds instead of by a
per-transition ease, and a mid-move retarget stays continuous. Opt-in; the
default `'tween'` model is unchanged.

Existing spins are byte-for-byte unaffected: the new eases and the drive apply
only where you ask for them.
