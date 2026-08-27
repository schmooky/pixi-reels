# ADR 019: Built-in mask primitives beyond the rectangle

## Status: Accepted, implemented on `feat/masks-and-anticipation-feel`

## Context

ADR 014 promoted `MaskStrategy` to a public extension point and shipped two
implementations: `RectMaskStrategy` (one rect per reel, the default) and
`SharedRectMaskStrategy` (a single bounding box covering the whole set).
Both draw hard axis-aligned rectangles. Anything else — a rounded frame, a
hex grid, a board with soft corners — is left entirely to the consumer.

In practice that promise is thinner than it looks. A consumer writing a
rounded-corner mask today has to re-derive, from scratch, four things the
engine already knows:

1. **Which screen axis the strip runs along.** `MaskContext.axis` carries it,
   but every custom strategy has to branch on `axis.mainProp` itself to answer
   "which two corners are the ends of a reel".
2. **Curve bleed.** `SharedRectMaskStrategy` inflates its rect by
   `ctx.bleed` on the cross axis; `RectMaskStrategy` ignores `ctx.bleed`
   entirely. A custom strategy has to know that `bleed` exists, that it is
   cross-axis-only, and that `ctx.bleed` may be `undefined` on a context built
   by third-party code.
3. **Jagged silhouettes.** Pyramid / MultiWays sets give each reel its own
   `mainOffset` and `extent`, so `ctx.rects` is a staircase, not a rectangle.
   Rounding each rect independently pinches the shared edges between adjacent
   reels into visible notches. Rounding the outer bounding box throws the
   staircase away. Neither is what anyone wants.
4. **The union rule.** A PixiJS `Graphics` mask is the union of every filled
   shape in it. That is not obvious, and it is the whole reason per-reel masks
   work at all.

So the extension point is public but the knowledge required to use it is not
packaged. This ADR proposes packaging it as built-in strategies plus one
composition helper.

### What PixiJS 8.18 actually gives us

Worth stating, because it changes the cost of several options:

- `roundShape(points: RoundedPoint[], radius)` rounds the corners of an
  **arbitrary polygon**, per-point radius supported. This is the primitive for
  jagged-silhouette rounding; no hand-rolled `arcTo` path is needed.
- `regularPoly(x, y, radius, sides, rotation)` — hex and diamond cells for free.
- `cut()` closes the current path as a hole in the previous one. Frame and
  donut masks are expressible.
- `roundRect(x, y, w, h, radius)` takes a **single** radius. Per-corner
  rounding (round the reel's two ends, leave its sides square) is *not*
  expressible with `roundRect` and must go through `roundShape`.

### What PixiJS does not give us

- **Soft / feathered edges.** A `Graphics` mask is a binary stencil. A gradient
  fade at the reel ends requires an alpha mask — a `Sprite` with a texture and
  `mask` set on the container — which would change `MaskStrategy.build`'s
  return type from `Graphics` to something wider, and is therefore a v3 break.
  Out of scope here; noted so it is not re-discovered.
- **Boolean intersection or subtraction between two strategies.** Shapes in one
  `Graphics` union. `cut()` subtracts a hole from a path within one context, but
  there is no way to intersect the output of two independent strategies. A
  `composeMasks(a, b)` helper can therefore only ever mean union.

## Decision

Ship five additions. All are additive: `MaskStrategy` v2 and both existing
strategies are untouched, so no existing game changes behaviour.

### 1. `RoundedRectMaskStrategy`

```ts
new RoundedRectMaskStrategy({
  radius: 16,
  scope?: 'set' | 'reel',   // default 'set'
})
```

- `'set'` (default) rounds the four corners of the union bounding box. Safe at
  any cross gap. On a pyramid it also discards the staircase and shows buffer
  cells past the short reels, which is what `SilhouetteMaskStrategy` is for.
- `'reel'` rounds all four corners of each reel box, so each reel reads as its
  own rounded card. Correct only when reels are visually separated by a non-zero
  cross gap; at gap `0` neighbours share an edge, and rounding both sides of it
  bites a lens-shaped notch out of every seam. The strategy warns once when it
  sees touching rects.

**The `'ends'` scope from the first draft does not exist**, and the reasoning
that produced it was wrong. It was going to round "only the corners at the
main-axis ends of each reel, leaving the sides square" — but a rectangle's four
corners *are* its main-axis ends, so that is `'reel'` with extra words, and it
pinches at gap `0` in exactly the same way. The seam problem cannot be solved by
choosing corners on a per-reel box; it is solved only by rounding the
silhouette, which is item 2. Two scopes, not three.

Radius is clamped per corner to half the shorter adjacent edge — by PixiJS
itself, inside `roundRect` / `roundShape` — so a large radius on a thin reel
degrades to a stadium rather than inverting, and the engine needs no clamp of
its own.

### 2. `SilhouetteMaskStrategy`

The interesting one. Computes the **rectilinear union outline** of `ctx.rects`
and rounds every vertex of it, including the concave inner corners of a
staircase.

Because reels are column-ordered along the cross axis and each rect is
axis-aligned, the union outline needs no general polygon clipper: walk the reels
in order emitting the leading main edge, then walk back emitting the trailing
main edge. The result is a rectilinear ring, which goes straight to
`roundShape`. Cost is O(reels).

```ts
new SilhouetteMaskStrategy({ radius: 20, concaveRadius?: number })
```

Preconditions and degradation:

- Requires cross gap `0`. With a gap the reels are genuinely disjoint and the
  union is not one ring; the strategy detects this and falls back to
  `RoundedRectMaskStrategy({ scope: 'reel' })` with a one-time warning.
- Concave corners take a separate, usually smaller radius, because the step they
  sit on is often much shorter than the outer edges. Defaults to `radius`; `0`
  leaves them sharp.
- **Concave rounding confirmed against PixiJS 8.18.1.** `roundedShapeArc`
  derives `radDirection` / `drawDirection` from the sign of the cross product of
  the incoming and outgoing edges, and arcs concave vertices the opposite way
  from convex ones. The `arcTo` fallback is not needed. Convexity is still
  computed engine-side, because the *radius* assignment differs per vertex and
  Pixi has no notion of a concave radius.
- Convexity is judged against the ring's own winding (signed area) rather than
  against a fixed sign, so it does not matter which way round the walk emits the
  outline — which it does differently per axis.

This is the strategy that answers "rounded masks that actually work on reels of
different shapes".

### 3. `PathMaskStrategy`

```ts
new PathMaskStrategy((g, ctx) => { /* draw anything */ })
```

An escape hatch that removes the boilerplate — version marker, `build`/`update`
split, `clear()` on update — from every one-off custom mask. Today the smallest
possible custom strategy is ~25 lines of ceremony around one `g.rect(...)` call.
This makes it one line. It is not a feature so much as the removal of a tax, and
it is what recipe authors should reach for before writing a class.

### 4. `inset(strategy, px)` and `composeMasks(...strategies)`

Two decorators.

`inset` shrinks any strategy's output uniformly; negative grows. Implemented by
deriving a `MaskContext` rather than by touching the produced geometry, so it
composes with any strategy including a custom one. This is the fix for "art
bleeds a pixel past the frame" without rewriting the strategy.

The two axes go through different mechanisms, and the first implementation,
which treated them alike, was wrong twice over:

- **Cross** rides on a negated `ctx.bleed`. Every strategy already knows what
  its own cross edges are, and they disagree for good reasons — a per-reel mask
  insets each reel's sides, a shared box the outer pair, the silhouette only the
  two outermost reels. Shrinking each rect's cross size directly instead opens a
  gap between neighbours, which then fails the silhouette's contiguity test and
  silently drops it to the per-reel fallback.
- **Main** rides on the rect *sizes* plus a new optional `MaskContext.origin`.
  Moving the rects *and* setting the origin applies the offset twice.

`MaskContext.origin` is the one interface addition: an optional screen-space
shift that strategies drawing from `(0, 0)` rather than from a rect must add.
Optional and defaulted, exactly as `bleed` was, so no version bump. A custom
strategy that ignores it insets in size but not in position — documented on the
field.

`composeMasks` draws several strategies into one `Graphics`. Union semantics
only, per the PixiJS limitation above — documented on the function, not left to
be discovered. The motivating case is a reel set plus a detached banner cell
that must share one mask.

Combining strategies needs a seam `MaskStrategy` does not have: `build` and
`update` both assume the strategy owns its `Graphics`, so two of them yield two
objects and a viewport that accepts one. Hence `DrawableMaskStrategy`, which
adds `draw(g, ctx)`. Every built-in implements it, including the two that
already shipped. A strategy that does not is still accepted everywhere —
`composeMasks` nests its `Graphics` as a child, which unions correctly because a
PixiJS stencil mask renders the mask container's whole subtree, at the cost of
one scene node.

### 5. Fix: `RectMaskStrategy` ignores `ctx.bleed`

`SharedRectMaskStrategy` inflates by `ctx.bleed` on the cross axis;
`RectMaskStrategy` does not. On a warped set with `curveBleed(...)`, per-reel
masks clip the overhang the bleed was requested for. The builder papers over
this by auto-switching to `SharedRectMaskStrategy` when the curve leans, but the
per-reel path is still wrong on its own terms, and a consumer who calls
`.maskStrategy(new RectMaskStrategy())` explicitly defeats the auto-switch and
gets the clipping back with no warning.

Applying bleed on the cross axis in `RectMaskStrategy` is the correct fix. It is
a behaviour change for any set that has both `curveBleed > 0` and an explicit
`RectMaskStrategy`, which is a narrow enough intersection to take in a minor
with a changeset note.

### Considered and rejected for now

- **`CellMaskStrategy` / `HexMaskStrategy` (one shape per cell).** Needs cell
  rects in `MaskContext`, which is an interface addition, and it is actively
  wrong for anything that moves: a per-cell mask clips a symbol the instant it
  is between two cells, which is every frame of a spin and every cascade fall.
  It is only meaningful for at-rest board layouts (hold-and-win). If it ships it
  should ship as a board-level feature, not a reel-set mask strategy, and it
  should refuse to install on a set that spins.
- **Feathered / gradient edges.** Requires widening the `build()` return type;
  v3 material.
- **Boolean intersection between strategies.** Not expressible.

## Consequences

- Public surface grows by three classes and two functions. Kept in one module so
  it can be tree-shaken.
- `SilhouetteMaskStrategy` puts a real geometry routine in the engine. It needs
  its own tests over randomised staircase shapes, in all four
  orientation x direction combinations, in the style of ADR 018 — the union walk
  is exactly the kind of code that passes on vertical and mirrors wrong.
- The `ctx.bleed` fix means `MaskContext.bleed` is now honoured by every built-in
  strategy, which makes it safe to document as a general contract rather than a
  `SharedRectMaskStrategy` quirk.
