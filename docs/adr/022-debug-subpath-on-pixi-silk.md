# ADR 022: The visual debug tools are a subpath drawn with pixi-silk

## Status: Accepted, implemented on `feat/debug-pixi-silk`

## Context

ADR 006 made debugging data-first: `debugSnapshot`, `debugGrid` and
`enableDebug` hand an agent JSON because it cannot see the canvas. The overlay
added later (`debugOverlay`) is the other half: the same state drawn on the
canvas for a human, so the picture can be checked against the numbers.

The overlay drew with PixiJS `Graphics`, which tessellates. A reel set is
almost never shown at 1x: the host fits it to a canvas, the docs site's runner
scales every demo down. At those scales a 1px outline crawls between pixels
and a rounded corner facets, which is the worst possible property for a tool
whose whole job is to show where a line is. The recipes on the docs site each
drew their own readouts the same way, as bare `Text` on the page background
with hand-picked greys, in about 120 variations.

The overlay also only drew geometry. The questions people actually bring to a
debugger - which reel stopped late, how long the tease held, whether the slam
cut a stop short, why a spin felt slow - were answerable only by reading the
events panel line by line.

## Decision

**Draw the debug tools with pixi-silk.** Its `SilkGraphics` renders every shape
as an exact signed distance field: edges are anti-aliased per pixel at any
scale and DPR, dashes are drawn in the shader, and each object is one draw
call. That is what an overlay needs, and nothing a production reel needs.

**Put the drawing behind `pixi-reels/debug`, with pixi-silk an optional peer.**
The same shape as ADR 011's `pixi-reels/spine`: a build that never imports the
subpath never resolves the dependency, and the main entry carries no drawing
code for debugging at all. The data-only tools stay in the main entry, because
the testing harness and a headless agent need them without a renderer, and they
cost nothing to keep there. `enableDebug` is data-only too: its `showMask()` and
`overlay()` helpers, which drew, are gone; the overlay's `mask` layer replaces
the first, a direct `debugOverlay` call the second.

**Record rounds, then draw them.** `SpinMetrics` listens on the set bus and
every reel bus and keeps, per round, each reel's phase spans, stop request,
landing, settle and tease window, every skip press and the landing order, plus
a speed trace when it has a ticker. The overlay's `metrics` plaque and
`timeline` panel are drawings of that record, and `enableDebug().metrics()` is
the same record as JSON, so the human and the agent read one source. A round is
`spin:start` to the next `spin:start`, the unit the engine's own events use,
which makes each cascade refill a round of its own.

**One readout primitive.** `DebugPlaque` is rows of monospace text on a silk
plate, sized from the character count instead of measured, so it is exact,
headless-safe and cheap to update per frame. The overlay's panels are built
from it, and every recipe readout uses it instead of a bare `Text`.

## Consequences

- **Breaking.** `debugOverlay` and `OVERLAY_LABEL` moved to the subpath, and
  the window hook lost two drawing helpers. Hence a major, and a migration
  section.
- The overlay's `metrics` and `timeline` panels sit under the mask and add to
  the reel set's bounds. A host that framed its camera before enabling them has
  to re-fit; the docs runner does.
- pixi-silk 0.1 is WebGL2 only and dashes paths and ellipses but not
  `roundRect` strokes. `roundRectPath` traces a box as a path to get dashed
  outlines; it can go once pixi-silk dashes rect strokes itself.
- Headless tests construct `SilkGraphics`, whose shader probes a WebGL context
  through `DOMAdapter.createCanvas()`. The test setup installs an adapter whose
  canvas has no WebGL, which the probe treats as "use mediump".
