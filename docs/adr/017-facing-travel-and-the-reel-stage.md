# ADR 017: Facing vs travel, and a composition layer over ReelSets

## Status: Partially accepted, shipped in 2.0.0

**Section A (facing / travel split) is accepted and enforced.** The invariant -
travel changes motion, facing changes art, they never change each other - is
in `CLAUDE.md`'s stability rules and is machine-checked: the contract suite
asserts `view.rotation === 0` and unit scale for every symbol at rest, mid
spin and landed, across all four orientation x direction combinations. No
`facing` KNOB shipped, because nothing needed one; the invariant was the
valuable half.

**Section B (`ReelStage`) is NOT shipped.** Two of its seams did land -
`spotlight:start` / `spotlight:end` are emitted (C1), and gsap is per reel
set rather than a process-global (B2), which section B named as a live footgun
under a stage. Composition itself stays user-land: the `banner-ways` recipe
builds a banner above a grid with a plain `Container`, and the recipe runtimes
accept that container so it scales and centres as one. That is the whole of
what `ReelStage` would have provided so far, so the abstraction has not earned
its place yet.

Two related refinements:

- **§A** splits ADR 016's single "orientation" concept into **facing** (which way the art looks) and
  **travel** (which way symbols move). This is a vocabulary and invariant change, not a new parameter.
- **§B** proposes `ReelStage`, a coordination layer over multiple `ReelSet`s — the supported answer to
  "five vertical reels with a horizontal banner above them, sharing one presentation."

§B is mostly buildable **today with zero library changes**. The four seams it can't reach are cheap, and
three of them should land inside ADR 016's breaking window rather than forcing a v3.

Verified against HEAD (`1.6.1`).

---

# §A — Facing and travel are different things

## A.1 The problem with "the reel is vertical"

ADR 016 §2 names three concepts (orientation, direction, gravity) and treats orientation as one thing:
*the axis the strip travels along*. That silently bundles a fourth: **the frame the art is drawn in.**

Today they are welded by accident, not by design. `HorizontalReel` pins `view.y = 0` and never rotates a
symbol (`:281, :289, :363, :421, :516`), so horizontal reels happen to render upright art. Nothing
states that as a rule, nothing tests it, and ADR 016's rejected Alternative A — rotate the container —
is exactly the fix a future contributor reaches for when they don't know the rule exists.

Name them:

| Concept | Question it answers | Scope | Default |
|---|---|---|---|
| **facing** | which way is "up" for the symbol art | per ReelSet | screen-up (identity) |
| **travel** | which axis symbols move on, and which way along it | axis per ReelSet, polarity per reel, overridable per spin | vertical / forward |
| **gravity** | which way cascade symbols fall | per ReelSet | follows travel |

The rule that follows, and that ADR 016 currently only implies:

> **Changing travel never changes facing.** Art stays upright when a reel goes sideways or upward.

## A.2 Why this is an invariant, not a parameter

The tempting move is to ship `facing: 0 | 90 | 180 | 270`. Don't — at least not in v2.

The repo's own rule 2 ("no flexibility that wasn't requested") applies, and the use cases evaporate on
inspection. A tilted or isometric reel bank is `reelSet.rotation`, which Pixi gives for free and which
does not need engine support. Landscape cells holding portrait-designed art is `resize(w, h)` doing its
job. The only case a real `facing` parameter buys is art that reads *along* the strip — a ticker with
sideways letters — which nobody has asked for.

What the split buys right now is **correctness pressure**:

- It makes ADR 016 §3.3's "screen-space stays screen-space" a stated invariant instead of a lucky
  property. `ReelSymbol.resize(width, height)` receives *screen* dimensions because facing is identity,
  not because vertical reels are the only kind.
- It kills Alternative A properly. "Rotate the container" isn't merely awkward — it changes facing to
  fix travel, which is a category error. That's a one-line rejection instead of a paragraph.
- It disambiguates the motion blur axis. Blur follows **travel**, never facing. ADR 016 auto-derives
  `MotionBlurOptions.axis` from the travel axis, which is already correct under this split and would be
  subtly wrong under a facing-derived one. That is the proof the distinction is load-bearing rather than
  academic.

### The seam, for when someone does ask

Two application points, both already isolated by ADR 016:

- `Reel._placeSymbolView` sets `view.rotation` from facing.
- `ReelSymbol.resize()` receives art-frame dimensions — under 90° facing, `(height, width)`.

Nothing else moves, because everything under `symbols/` and `spine/` is isotropic (verified in ADR 016
§3.3). A future `facing` parameter is a two-call-site change *provided* travel never touches either
call site — which is exactly what the invariant guarantees.

## A.3 Amendments to ADR 016

1. **§2** gains facing as a fourth named concept, with the invariant above.
2. **§8 Alternative A** is rejected on the sharper ground: it conflates facing with travel.
3. **§10** gains an invariant test, run across all four travel combinations:
   `view.rotation === 0` for every symbol at every lifecycle stage, and `resize()` called with screen
   `(width, height)`. This is the test that would have caught someone "fixing" horizontal by rotating.
4. **CLAUDE.md** invariants section: replace `ReelMotion` wraps via `_maxY`/`_minY` with
   *travel changes motion; facing changes art; they never change each other.*

---

# §B — `ReelStage`: composing ReelSets

## B.1 Why a stage rather than mixed orientation inside one ReelSet

ADR 016 scopes mixed orientation out of `ReelSet` because the mask rect layout, cross-axis reel
marching and `getVisibleGrid()` all assume one shared cross axis. That scoping is right, and it has a
positive story rather than being a limitation: **a horizontal banner above five vertical reels is two
reel sets sharing one presentation.**

The repo already established this pattern. `HoldAndWinBoard` is an outer object with its own
`EventEmitter` (`board/HoldAndWinBoard.ts:79`) driving `BoardGrid`, which builds up to 25+ independent
1×1 `ReelSet`s (`BoardGrid.ts:119-162`) and coordinates them through the public API — `Promise.all` over
per-cell `spin()` (`:222-233`), per-cell speed profiles for stagger waves (`:116-117`), a slam loop
(`:239-249`). `ReelStage` is that pattern promoted to a first-class, documented thing.

This also stays inside ADR 007. A stage owns *visual lifecycle coordination*; it owns no pay rules, no
ways math, no outcome selection.

## B.2 What already works today — zero library changes

Verified. All of this is available at 1.6.1:

| Want | How |
|---|---|
| Two sets, one clock | one `Ticker` into both `.ticker(t)` (`ReelSetBuilder.ts:354`) |
| One awaited spin | `Promise.all([main.spin(), banner.spin()])` — every lifecycle field is instance-scoped (`_isSpinning`, `_spinGeneration`, `_landedReels`, `_currentSpinResolve`); precedent at `BoardGrid.ts:222` |
| **Global stop order across sets** | compute one absolute ms schedule and slice it: `main.setDropOrder(global.slice(0,5))`, `banner.setDropOrder([global[5]])` (`ReelSet.ts:1371`). Delays are absolute offsets from each set's stop-sequence start |
| Dim both sets together | `a.viewport.showDim(x)` + `b.viewport.showDim(x)` — refcounted at `ReelViewport.ts:148`, so overlapping requests compose |
| Shared speed | coordinator calls `setSpeed(name)` on both (`ReelSet.ts:1610`) |
| Shared slam | `skipSpin()` on both, try/catch the pre-`setResult` throw (`SpinController.ts:935`) |
| Shared symbol *definitions* | one `registerSymbols(registry)` callback into both `.symbols()` calls (`BoardGrid.ts:138`) |
| Debug on both | `enableDebug(set, 'main')` / `enableDebug(set, 'banner')` → `__PIXI_REELS_DEBUG_INSTANCES` (`debug/debug.ts:344`) |

Two gotchas that bite immediately:

- Call `setResult()` on both sets **in the same synchronous block**. Stop delays are measured from each
  set's own `_tryBeginStopSequence` (`SpinController.ts:1427`), so a tick of skew between the two
  `setResult` calls skews the whole global schedule.
- `setStopDelays` is **sticky across rounds** by design (`ReelSet.ts:1342-1359`). Re-set both every
  round if the pattern varies.
- Use **two builders**. Reusing one shares `_symbolRegistry` (`ReelSetBuilder.ts:73`), and
  `SymbolRegistry.register` throws on duplicate ids (`SymbolRegistry.ts:31-33`).

### The shortcut worth knowing about

If the banner doesn't need to *scroll* sideways — many overhead reels just drop and reveal — then a
second `ReelSet` with `reelCount(5).visibleCells(1)` is a horizontal band of five cells **today**, with
anticipation, spotlight, pins, `setDropOrder`, `WinPresenter`, `enableDebug` and all 46 events. You lose
only sideways travel. That is a materially better banner than `HorizontalReel` and it needs nothing from
ADR 016.

## B.3 What is genuinely blocked

Four things, and only the third is expensive.

**1. One shared mask / unmask / spotlight layer.** `ReelViewport` is constructed inside
`ReelSetBuilder.build()` (`:701`) and there is no `.viewport()` method. Sharing one today breaks four
ways: `ReelSet.addChild(this._viewport)` (`ReelSet.ts:557`) *reparents* it, so the second set steals it;
both sets' reel 0 collide at `x = 0, zIndex = 0` inside one `maskedContainer` (`Reel.ts:298, :304,
:1337`); `ReelSet.destroy()` calls `viewport.destroy()` with `{children: true}` (`ReelSet.ts:1986`,
`ReelViewport.ts:227`), nuking both sets' reels, with the `_isDestroyed` guard turning the second call
into a silent no-op; and `dimOverlay` is drawn once at ctor size (`ReelViewport.ts:180`) and never
resized by `updateMaskSize` (`:217-222`), so a shared overlay would dim only one set's rect.

*(That last one is a live bug independent of this ADR — resize the overlay in `updateMaskSize`.)*

**2. One shared symbol pool.** `SymbolFactory` is built per set (`ReelSetBuilder.ts:626`), so N sets =
N `ObjectPool`s. Textures are shared by reference, so the cost is `ReelSymbol` instances, not GPU
memory — `BoardGrid` accepts this across 25+ cells. For two sets it is negligible. Low priority.

**3. One `SymbolSpotlight` addressing both sets.** The blocker is the public type: `SymbolPosition` is
`{reelIndex, rowIndex}` with no set qualifier, and `SymbolSpotlight` takes a single `(reels, viewport)`
pair fixed at construction (`ReelSet.ts:554`, `SymbolSpotlight.ts:67-70`). Reel 0 of the banner and reel
0 of the main grid are indistinguishable.

**This is the one with a deadline.** ADR 016 §5 already renames `SymbolPosition.rowIndex → cellIndex`,
so the type breaks in v2 regardless. Adding an optional `setId` in the same commit is free; adding it in
v3 is a second breaking change to the same public type. Decide during ADR 016, not after.

Two things make the rest of it easier than it looks: promotion already round-trips through global
coordinates (`SymbolSpotlight.ts:130-134`, `:169-174`), so cross-set promote into one
`spotlightContainer` works geometrically without touching the class; and dimming is a single
viewport-wide rect with a refcount (`:103`, `ViewPort:148`), so per-set dim already composes.

*(Also found: `spotlight:start` / `spotlight:end` are declared at `events/ReelEvents.ts:80-81` and
**never emitted** — `SymbolSpotlight` holds no reference to the event bus. A coordinator has to poll
`spotlight.isActive`. Worth fixing regardless of this ADR.)*

**4. A banner that genuinely travels sideways with the full feature set.** That is ADR 016. Nothing
here substitutes for it.

## B.4 The four seams — three belong in ADR 016's window

| Seam | Change | Where it belongs |
|---|---|---|
| `SymbolPosition` gains optional `setId` | additive field on a type ADR 016 already breaks | **ADR 016 PR 10** — free now, breaking later |
| `ReelSetBuilder.viewport(existing)` + per-set origin offset | must also fix reparenting, reel x/zIndex collision, destroy ownership, dim overlay resize | **ADR 016 PR 8** — that PR already touches viewport construction and mask rects |
| Hoist `SpinController._stopDelayFor` into an injectable `StopScheduler` | 4 lines today (`:1413-1417`), one call path, `setStopDelays` becomes a scheduler impl | **ADR 016 PR 9** or standalone; non-breaking if the default preserves `i * stopDelay` |
| `ReelSetBuilder.symbolFactory(existing)` + ownership flag | `ReelSet.destroy()` must not kill a borrowed pool (`ObjectPool.destroy` at `pool/ObjectPool.ts:97-101` makes later `acquire()` throw at `:32-38`) | later; low value |

Doing the first three inside the v2 window is the whole argument of this section. They are small, they
are all in files ADR 016 already opens, and each one deferred is a separate breaking change later.

## B.5 `ReelStage` sketch

```ts
const stage = new ReelStage({ ticker: app.ticker })
  .add('main',   mainReelSet,   { origin: { x: 0, y: 140 } })
  .add('banner', bannerReelSet, { origin: { x: 0, y: 0   } })
  .stopOrder(['main:0','main:1','main:2','banner:0','main:3','main:4'], { stepMs: 140 })
  .build();

await stage.spin();
stage.setResult({ main: mainGrid, banner: bannerGrid });   // one synchronous block
stage.spotlight.show(wins);                                 // cells are {setId, reel, cell}
```

Responsibilities: fan out `spin`/`setResult`/`setSpeed`/`skip`; own the global stop schedule; own one
spotlight and one dim across sets; expose one merged event bus with `setId`-qualified payloads; own
destroy ordering. It owns no math.

## B.6 MultiWays across the stage — read this before building it

Two readings of "MultiWays with a horizontal reel above," and they are different games.

**(a) The banner is a modifier row.** Each banner cell maps onto the vertical column beneath it,
contributing a wild, multiplier or extra symbol. Ways stays `Π(rows₁..₅)`; the banner mutates what is
*in* those columns. **This needs no ways work at all** — it is a `FrameBuilder` middleware plus a
stage-level "apply overlay before the columns resolve" hook. It is also the mechanic overhead reels
usually implement.

**(b) The banner is a sixth reel whose cells lie along X.** Then `ways = Π(rows₁..₅) × cells_banner`
and wins must traverse a non-rectangular topology. That needs an adjacency graph, not a grid.

Ship (a). Note (b) as out of scope with the reason.

And the reframe that makes either tractable: per ADR 007, **win detection is already not the library's
job** — outcomes arrive through `setResult()`, and even the examples do detection in
`examples/shared/mockServer.ts`. So "MultiWays across two sets" is almost entirely a *presentation*
problem: which cells light up, how the ways counter animates, how the spotlight reaches across sets.
Which lands back on exactly one blocker — `setId` on `SymbolPosition` (§B.3.3).

---

## Consequences

**Positive.** "Reel is vertical" stops being ambiguous. The upright-art guarantee becomes a tested
invariant instead of an accident, and the rejected container-rotation approach becomes a category error
rather than a judgement call. Composition gets a supported name and a documented path, most of which
works today. Three cheap seams land inside a breaking window that is already open.

**Negative.** `ReelStage` is a second orchestration layer alongside `BoardGrid` / `HoldAndWinBoard`, and
the repo now has three ways to drive multiple sets. Worth collapsing `BoardGrid` onto `ReelStage` later,
but not in the same release. And §A ships vocabulary and a test with no user-visible feature — a real
cost to justify at review time, paid for by what it prevents rather than what it enables.

**Neutral.** The most valuable finding here is that the composition the stage formalizes is ~90%
reachable at 1.6.1. If the banner tolerates a 5×1 vertical band instead of sideways travel, the whole
thing is a coordinator you can write this week, and ADR 016 becomes an upgrade rather than a blocker.
