# ADR 018: The motion contract

## Status: Accepted, shipped in 2.0.0

The fourteen laws run in CI against the SHIPPING `ReelMotion`, in all four
orientation x direction combinations, plus golden-master position traces and
the `ReelSet`-level isomorphism / mirror / facing checks. See
`packages/pixi-reels/tests/contract/`.

Two laws changed shape. L10 and L14 read the wrap callback's `arrayIndex` and
`direction` arguments, which A11 deleted as dead; they now observe where the
wrapped symbol actually IS in the strip array, which is stronger - a callback
cannot lie about it.

The suite is mutation-verified rather than merely green; the table in
`tests/contract/README.md` lists which mutation breaks which laws. One result
is worth carrying forward: a purely RELATIVE law (horizontal equals vertical
transposed) passes against a transposition applied inside the shared
projection, because both sides break identically. Relative laws need one
absolute anchor, and the same blind spot recurred twice more - in the
`getBlockBounds` block test and in the debug overlay's travel arrow, where a
mirrored arrow has identical bounds.

ADR 016 says *what* to build. This says *what makes it correct*, in a form CI can check.

**It is not a plan.** Every law below was run against the real `ReelMotion.ts` at HEAD and against a
reference implementation of ADR 016 §3.2. Harness and results in
`packages/pixi-reels/tests/contract/`.

**Headline: the contract found a defect in the shipping engine, and it disqualified ADR 016's proposed
motion model.** See §4.

---

## 1. Why a contract and not just tests

`ROADMAP.md:31` defers the axis refactor as "high regression risk to the vertical path." The risk is
real, but it is misdiagnosed. The design is not the hard part. The hard part is that ~60 files each do a
little coordinate math, and any one of them can silently use the wrong axis. Example-based tests catch
what someone thought to write down.

Three different instruments, doing three different jobs:

| Instrument | Catches | Blind to |
|---|---|---|
| **Golden masters** (ADR 016 §10.1) | any change in vertical behaviour | bugs that are already in the baseline; anything horizontal or reverse |
| **Laws** (this ADR) | violations of stated intent, in all four combos, on inputs nobody thought of | behaviour that is wrong but consistent with the laws |
| **Types** (§5) | axis confusion, at compile time, everywhere | semantics |

Golden masters freeze *behaviour, including bugs*. Laws state *intent*. You need both, and conflating
them is how a refactor "passes" while shipping the old defects onto a second axis.

---

## 2. The laws

Fourteen. All run under `fast-check` over randomised geometry (`cellSize` 20–200, `gap` 0–20,
`bufferStart` 1–3, `visibleCells` 1–6, `bufferEnd` 1–3), 300–400 cases each, against all four
orientation × direction combinations.

Notation: *strip* = the `M = bufferStart + visibleCells + bufferEnd` symbols; *pitch* = `cellSize + gap`;
*main* = the travel axis coordinate.

### Structural — must hold after every single call, forever

| | Law |
|---|---|
| **L1** | **RIGIDITY.** `main(symbols[i+1]) - main(symbols[i]) === pitch` for all `i`. The strip is a rigid body; nothing stretches. |
| **L2** | **ORDER.** `symbols` is strictly ascending by main. Array index *is* screen position — the invariant ADR 016 §3.2 leans on for every index-based accessor. |
| **L9** | **BOUNDEDNESS.** No symbol leaves `[minMain, maxMain]`. Nothing drifts off-strip over a long session. |

### Algebraic — the strip is a circle

| | Law |
|---|---|
| **L3** | **ZERO.** `advance(0)` moves nothing, reorders nothing, fires no wrap. |
| **L4** | **INVERSE.** `advance(d); advance(-d)` restores the exact configuration. Catches asymmetric wrap thresholds — the class of bug `ReelMotion.ts:37-45` documents having already been fixed once. |
| **L5** | **ADDITIVITY.** `advance(a); advance(b)` ≡ `advance(a+b)`. Frame rate cannot change outcome. |
| **L7** | **PERIODICITY.** Travelling exactly `M × pitch` returns every symbol to its starting position. |
| **L8** | **WRAP COUNT.** Wraps fired over travel `d` is `⌊d / pitch⌋ ± 1`. No skipped wraps — a skipped wrap feeds the landing frame one symbol short. |

### Interface

| | Law |
|---|---|
| **L6** | **SNAP.** After `snapToGrid()`, `main(symbols[i]) === getCellMain(i - bufferStart)` exactly. |
| **L10** | **WRAP INDEX.** The `arrayIndex` handed to the wrap callback is where the symbol actually ended up. |
| **L11** | **STEP TOLERANCE.** A full-cell step (what `CascadeMode.ts:22` permits) preserves L1, L2 and L9. |
| **L14** | **FEED EDGE.** Forward polarity feeds at `start`, reverse feeds at `end`. Every wrap, no exceptions. |

### Generalisation — the laws that make the *refactor* correct, not just the vertical path

| | Law |
|---|---|
| **L12** | **ISOMORPHISM.** The horizontal position trace equals the vertical trace read on the other axis, and the wrap traces are identical. |
| **L13** | **MIRROR.** `reverse(d)` is exactly `forward(-d)` — polarity is applied once, in one place, and nowhere else. |

L12 and L13 are the whole point. They machine-check the generalisation rather than sampling it, and
they are cheap because the engine is already headless (`FakeTicker`, `HeadlessSymbol`).

---

## 3. Results at HEAD

```
ReelMotion.ts @ 1.6.1                    10 passed, 1 failed   (L7 FAILS)
ADR 016 reference, vertical forward      11 passed, 0 failed
ADR 016 reference, vertical reverse      11 passed, 0 failed
ADR 016 reference, horizontal forward    11 passed, 0 failed
ADR 016 reference, horizontal reverse    11 passed, 0 failed
cross-combination                        L12, L13, L14 all pass
```

### L7 — the defect in the shipping engine

Minimal case: `cellSize 20, gap 4, bufferStart 1, visibleCells 2, bufferEnd 3` → pitch 24, M 6.
Travel exactly `6 × 24 = 144` in 15 steps of 9.6 (inside `StandardMode`'s half-cell cap):

```
start   0@-24  1@0  2@24  3@48  4@72  5@96
end     1@0    2@24 3@48  4@72  5@96  0@120     ← 5 wraps, not 6
```

The last symbol lands at `119.99999999999997`. `_wrapBottomToTop` guards on
`if (lastSymbol.view.y < this._maxY) return` (`ReelMotion.ts:108`), and `119.99999999999997 < 120`,
so the wrap does not fire. Shortfall: **2.8e-14**. Re-run with a step of 12 (exact in binary) and the
law passes — it is pure float accumulation.

The buffer-start slot is left empty and the strip sits one cell off its grid.

**Severity: latent, not live.** Under continuous motion the next tick pushes past the threshold and it
self-corrects, and the strip stays rigid throughout. It matters in exactly one situation: an operation
that lands on an exact slot multiple and then immediately snaps. That is `Reel.nudge()`
(`Reel.ts:943`: `totalDelta = distance * slotH`) — and the team has already been bitten here once, on
the other side of the strip: `_wrapTopToBottom`'s comment (`:117-124`) says the `minY` comparison is
non-strict *specifically* because "`Reel.nudge()` lands on exact integer slot offsets; strict `<` would
miss the wrap at exactly minY and the nudge would visually no-op."

The non-strict fix does not survive float accumulation. Landing at `minY + 3e-14` misses the wrap just
as landing at `maxY - 3e-14` does. **Both edges have the bug; only one was found, and it was found by
hand.** This one was found by a property test in about a second.

---

## 4. What this forces in ADR 016

### 4.1 The motion model is wrong — adopt the horizontal one

ADR 016 §3.2 keeps the current accumulate-and-compare model: add `d` to every symbol's position, then
compare accumulated floats against a threshold. **That model is what fails L7.** Any amount of
axis-generalisation on top inherits it, on both axes.

`HorizontalReel` does not have this bug, and not by luck. `_render` (`:434-439`) derives every position
from the array index each frame — `view.x = (k-1)*span + sign*_off` — so position error cannot
accumulate at all.

The reference implementation generalises that, with one further change the contract forced: **derive the
rotation count from total travel too, rather than mutating it incrementally.** An incrementally-mutated
count is exactly what lets float residue skip a rotation. With `q = travel / pitch` snapped to a whole
number inside 1e-9 and `rot = ⌊q⌋`, all four combos pass all fourteen laws.

The uncomfortable conclusion: **the 747 lines ADR 016 deletes contain the better numerics.** Generalise
the horizontal motion model and delete the vertical one, not the reverse.

Three things fall out for free:

- **The half-cell cap stops being correctness-critical.** The derive model absorbs any step size, so
  there is no "at most one wrap per call" precondition. `StandardMode`'s `±cellSize/2` clamp
  (`:12-17`) becomes a smoothness choice, not an invariant guard.
- **ADR 016 §10.7's latent `CascadeMode` bug disappears** rather than needing a separate fix — the
  full-cell clamp at `CascadeMode.ts:22` is only dangerous under accumulate-and-compare. L11 confirms
  it is safe under the derive model.
- **L1, L2 and L9 become true by construction** instead of invariants something has to maintain.

### 4.2 The golden-master gate has to be relaxed — and this is load-bearing

ADR 016 PR 3 says "baselines must not move one pixel." **That is now unachievable and, worse, wrong to
want.** The derive model produces different float values at exactly the boundaries where the old model
is defective. Byte-identity would enforce the bug.

Replace the gate with:

> Baselines must not move by more than 1e-6 at any frame, **and** every diff exceeding 1e-9 must
> coincide with a slot boundary. Each such diff gets an explicit line in the PR body naming which law
> the old value violated.

This is the concrete form of ADR 016 §10.1's warning that a golden master freezes bugs as well as
behaviour. It stopped being hypothetical.

### 4.3 Amendments

1. §3.2 — replace the `advance()` sketch with the derive-from-index + derived-rotation model.
2. §9 PR 3 — retitle to *"`ReelMotion` → derive-from-index travel coordinates"*, relax the gate per §4.2.
3. §9 PR 2 — the contract suite lands here, and **must pass against v1 except L7** before any refactor
   starts. That is the baseline claim.
4. §10.7 — drop the `CascadeMode` clamp fix; §4.1 subsumes it.
5. §1 — the horizontal comparison table needs a row admitting horizontal wins on numerics.

---

## 5. The other four layers

Laws are the middle of five. Each catches what the others cannot.

### 5.1 Types — make axis confusion a compile error

```ts
type Main   = number & { readonly __brand: 'main' };
type Cross  = number & { readonly __brand: 'cross' };
type Travel = number & { readonly __brand: 'travel' };
```

`ReelAxis` is the only thing that mints or reads a branded value. Then `advance(d: Travel)` cannot take
a main displacement, `_minMain: Main` cannot be compared to a `Cross`, and "I used the width where I
meant the height" — the single most likely error across 60 files — fails at compile time.

Zero runtime cost; brands erase. Brand at **boundaries only** (the axis API, `ReelMotion` fields, phase
configs) and keep raw `number` inside a single function body, or the arithmetic ergonomics get bad
enough that people cast around them.

This is also the loudest possible failure, which is the repo's stated preference.

### 5.2 A conformance suite, exported

Ship `runMotionContract(factory)` from `pixi-reels/testing`, next to `createTestReelSet` and
`FakeTicker`. Then the contract is executable and shippable: the engine runs it in CI, and **consumers
run it against their own custom `SpinningMode`s and phases** to verify a v2 migration. A contract you
can hand someone is worth more than one you can only read.

### 5.3 Dev-only runtime assertions

L1, L2, L6 and L9 are cheap enough to assert at every phase transition behind a `__DEV__` flag, hooked
into the existing debug system. Unit contracts test `ReelMotion` in isolation; these catch integration
errors where a phase writes a position behind the motion layer's back.

### 5.4 A lint rule instead of a code review

CLAUDE.md already says *"never mutate symbol Y outside the motion layer"* — enforced today only by
prose, and already violated by `ReelSymbol.playDestroy` (`:168-169, 184, 219`).

After PR 4, add a Biome rule banning `\.view\.(x|y)\s*[+-]?=` outside `core/ReelAxis.ts` and
`symbols/`, with `playDestroy` explicitly allowlisted and commented. Mechanical enforcement scales
across 12 PRs and several contributors; review does not.

### 5.5 CI gates

| Gate | Runs on |
|---|---|
| Contract, all four combos | every PR, from PR 2 onward |
| Golden masters, vertical forward, tolerance per §4.2 | PRs 3–9 |
| Facing invariant (ADR 017 §A) | every PR from PR 6 |
| Playwright visual, four combos | PRs 8, 11 |
| No-raw-position lint | every PR from PR 4 |

---

## 6. The public contract

Internal laws make it stable. This is what makes it *contractual* for consumers.

**The promise v2 makes, and can prove:**

> For `orientation: 'vertical', direction: 'forward'`, pixi-reels v2 reproduces v1.6.1 frame-for-frame
> within 1e-6, except at slot boundaries where v1 skipped a wrap (contract L7). Every such divergence is
> enumerated in the migration guide.

That is a stronger and more honest statement than "we didn't break anything," and the golden masters
back it. Plus, per ADR 016 §10.8: no silent aliases, every renamed key throws with the codemod command,
and the conformance suite ships so consumers can check their own extensions.

---

## 7. Consequences

**Positive.** The refactor's central risk becomes a CI gate. A latent boundary defect is already found
and fixed before the work starts. The motion model choice is settled by evidence rather than
preference. Consumers get an executable contract for their own extensions.

**Negative.** `fast-check` is a new dev dependency. Branded types cost ergonomics at every boundary.
And the contract will keep finding pre-existing bugs — every one is a scope decision under time
pressure, which is a real cost even though each finding is a win.

**Neutral.** The most useful thing here was not a decision. It was running eleven properties against a
file that has shipped for six months and watching one fail in under a second. That capability should
outlast this refactor.
