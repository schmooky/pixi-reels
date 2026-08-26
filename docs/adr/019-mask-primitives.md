# ADR 019: Built-in mask primitives beyond the rectangle

## Status: Proposed

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
  scope?: 'ends' | 'reel' | 'set',   // default 'ends'
  bleed?: boolean,                    // default true
})
```

- `'ends'` (default) rounds only the two corners at each end of the **main**
  axis per reel, leaving the cross-axis sides square. Adjacent reels butt
  together with no notch, which is what makes this the safe default and the one
  that survives a zero cross gap. Resolved through `ctx.axis`, so a horizontal
  set rounds its left/right ends without the caller knowing.
- `'reel'` rounds all four corners of each reel box. Correct only when reels are
  visually separated (non-zero cross gap); pinches otherwise. The strategy warns
  once when it detects touching rects.
- `'set'` rounds the outer bounding box only. Equivalent to
  `SharedRectMaskStrategy` with corners, and carries the same pyramid-peek
  caveat.

Radius is clamped per rect to half the shorter side, so a large radius on a thin
reel degrades to a stadium instead of inverting.

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
- Concave corners need a separate (usually smaller) radius, because the
  clamp there is against the *step height*, not the rect side. Defaults to
  `radius`, clamped.
- Whether PixiJS `roundShape` arcs concave vertices the correct way must be
  verified against the shipping build before this lands — if it does not, the
  fallback is an explicit `arcTo` ring, which is the same walk with a different
  emitter.

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

`inset` grows or shrinks any strategy's output uniformly. Negative shrinks.
Implemented by scaling the rects in a derived `MaskContext` rather than by
touching the produced geometry, so it composes with any strategy including a
custom one. This is the fix for "art bleeds a pixel past the frame" without
rewriting the strategy.

`composeMasks` draws several strategies into one `Graphics`. Union semantics
only, per the PixiJS limitation above — documented on the function, not left to
be discovered. The motivating case is a reel set plus a detached banner cell
that must share one mask.

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
