# v2 execution plan

Decision: ship **one bulk v2** off a long-lived `v2` branch, breaking whatever needs breaking, merged
to `main` as a single release.

This document is the operational plan. The reasoning lives in ADR 016 (axis + direction), ADR 017
(facing/travel split, `ReelStage`), ADR 018 (the motion contract).

---

## 1. Workflow — decided

**Every change is its own PR, targeting `v2`.** `v2` → `main` is one merge at the end.

That keeps `CLAUDE.md`'s rule intact — one logical change per PR, reviewed individually — while still
producing a single bulk release. The branch is an **integration target, not a workspace**. The failure
mode this avoids is 45 renames plus a motion rewrite arriving as one unreviewable diff; nothing about
"one v2" requires that.

Everything goes to `v2`, including the non-breaking work. One operational consequence: at the observed
cadence (3–6 commits/week, a feature PR and a release roughly weekly), a branch open ~2 months absorbs
about eight feature merges from `main`. **The weekly `main` → `v2` merge is therefore load-bearing, not
hygiene.** Skip it for three weeks and the conflicts land in files the refactor has already rewritten.

---

## 2. Branch policy

| | |
|---|---|
| Branch | `v2`, cut from `main`, **never rebased** (people will branch off it) |
| PRs | one logical change each, targeting `v2`, same review bar as `main` |
| Drift | merge `main` → `v2` **weekly**, and always immediately after a `chore: version packages` commit |
| Releases | changesets pre-release mode: `pnpm changeset pre enter next` → publishes `2.0.0-next.N` |
| Exit | `pnpm changeset pre exit` → merge `v2` → `main` → version + publish `2.0.0` |
| CI | full suite on every `v2` PR. `changeset-gate` applies unchanged |

Two tooling notes:

- `.changeset/config.json` has `"baseBranch": "main"`. Pre-release mode is the supported way to run a
  breaking line off a branch — do **not** repoint `baseBranch`.
- Publish `2.0.0-next.N` early and often. It is the only way to test the codemod against a real install
  rather than a local link, and the only way to get consumer feedback before the rename is irreversible.

---

## 3. The PR queue

Three lanes. **Lane B and Lane C have no dependency on the axis work** and can start on day one.

### Lane A — the critical path

| PR | Change | Depends on |
|---|---|---|
| **A1** | Fix `movePin` / `_pinOverlayCellY` `container.y` disagreement | — |
| **A2** | Add `ReelAxis` + `VERTICAL_FORWARD`, unused. Pure add | — |
| **A3** | Contract suite; non-square `testHarness` default; record golden masters | A1 |
| **A4** | `ReelMotion` → derive-from-index travel coordinates | A2, A3 |
| **A5** | `Reel` position writes through the axis (incl. `_syncUnmaskedViewOffsets` asymmetry) | A4 |
| **A6** | `SpinningMode.computeDelta` | A4 |
| **A7** | Phases via `axis.mainProp` — start pull, stop bounce, adjust squash | A5 |
| **A8** | Cascade phases + `tumbleAlgorithm` on the gravity axis; `parkOutsideWindow` | A5, A6 |
| **A9** | Builder geometry; mask auto-pick on cross gap; `ReelSetBuilder.viewport(existing)` | A5 |
| **A10** | `ReelSet` accessors, pin overlays, MultiWays reshape gap axis; injectable `StopScheduler` | A1, A5 |
| **A11** | Drop the dead `direction`/`row` args from the wrap callback | A4 |
| **A11b** | **`debugOverlay` — axis layers** (travel arrow, feed edge, wrap thresholds, HUD). See §7 | A5, C3 |
| **A12** | **The rename pass + codemod + loud throws on v1 keys** | **B1**, A4–A11 |
| **A13** | `SymbolPosition` gains `setId`; `getSymbolFootprint`'s `size` aligned with `SymbolData.size` | A12 |
| **A14** | `MaskStrategy` v2 — carries the axis, so a strategy cannot silently transpose | A9, A12 |
| **A15** | Fold `AdjustPhase` into `SpinController`, remove from `PhaseFactory` | A7, A10 |
| **A16** | `bufferSymbolsPerReel` **and** the `reels[0]` fix in `_coordinateBigSymbols` (paired) | A12 |
| **A17** | Per-reel cross offsets; the trapezoid becomes a special case | A9, A12 |
| **A18** | Branded `Main` / `Cross` / `Travel` types at the boundaries | A12 |
| **A19** | Enable `orientation: 'horizontal'`; port both recipes; delete `src/horizontal/` | all of the above |
| **A20** | Migration guide, `CLAUDE.md` invariants, ADR statuses, reconcile `TODO.md` + `ROADMAP.md` | A19 |

### Lane B — day one, parallel to Lane A

| PR | Change | Why it is independent |
|---|---|---|
| **B1** | **Delete the legacy `string[][]` negative-index form.** `ColumnTarget` all the way down | Touches the frame pipeline, not the motion layer. **Must land before A12** — otherwise you rename code you are about to delete, and ADR 016 §6.2's risk gets managed instead of disappearing |
| **B2** | Per-set gsap; retire the `gsapRef` process-global | Isolated to `utils/gsapRef.ts` + the builder |

### Lane C — trivial, any time

| PR | Change |
|---|---|
| **C1** | Emit `spotlight:start` / `spotlight:end` (declared at `ReelEvents.ts:80-81`, never fired) |
| **C2** | Resize `dimOverlay` in `updateMaskSize` |
| **C3** | **`debugOverlay` — static layers** (mask, cells, buffers, symbol bounds, blocks, pins). Absorbs `showMask`. See §7 |

### Scheduling notes

- **The long pole is A4 → A5 → A12 → A19.** Everything else slots around it.
- **Start B1 immediately, alongside A1 and A2.** It is the only item that makes the refactor *smaller*,
  and it gates A12.
- **A3 gates verification for A4–A11.** Land it early or those PRs have no gate to pass.
- **A1 must precede A3**, or the golden master freezes a known bug (ADR 018 §10.1).
- **Land C3 first if you can.** The overlay is the review tool for every PR after it — a reviewer
  seeing a travel arrow and a wrap threshold drawn on the canvas will catch axis mistakes that a diff
  hides. A11b then extends it as soon as `ReelAxis` is wired.
- A6, A11, B1, B2, C1, C2 are all independently mergeable — good candidates for parallel work or for a
  second contributor.

### Decisions to settle before A12

1. **z-stacking default under reverse polarity** (ADR 016 §6.3) — an art call, not an engineering one.
2. **Big symbols vs `directionPerReel`** (ADR 016 §6.7) — fix the coordinator, or throw at build time.
   Pairs with A16.

---

## 4. Definition of done, per PR

```
pnpm --filter pixi-reels typecheck
pnpm --filter pixi-reels test                # includes tests/contract/*.contract.test.ts,
                                             # all four orientation x direction combos
pnpm check:lint
.changeset/*.md present
```

Plus, for A4–A11 only: golden masters within **1e-6**, and every diff above 1e-9 must sit on a slot
boundary with a line in the PR body naming which contract law the old value violated. This is not
byte-identity — ADR 018 §4.2 explains why byte-identity would enforce the L7 defect.

Plus, from A5 onward: the no-raw-position lint rule (ADR 018 §5.4).

---

## 5. Merge checklist — `v2` → `main`

- [x] Contract green on all four combos - `tests/contract/motion.contract.test.ts`,
      and mutation-verified (see that directory's README)
- [x] Golden masters green - `tests/contract/goldenTrace.contract.test.ts`. No
      boundary diffs to enumerate: the traces were recorded after the derive
      -from-index model landed, so there was no v1 baseline to move off
- [x] **Browser coverage of all four combos** - `tests/e2e/orientation-matrix.spec.ts`
      against `tests/e2e/fixtures/orientation-matrix`, wired into CI as its own
      job. Mutation-verified: breaking the `feedEdge` derivation fails 3 of 4.
      Deliberately NOT pixel diffing - a WebGL screenshot baseline is GPU- and
      platform-dependent, so one recorded on a dev machine fails on CI's ubuntu
      runner for reasons unrelated to the engine. These assert engine state via
      the debug snapshot, which is why that snapshot exists
- [x] Codemod run against `examples/` and `apps/site/` with zero manual fixups -
      verified against the 112 site recipes at their pre-rename revision
      (`5a9d059`); output carries zero v1 API names in code
- [ ] **At least one external consumer has upgraded from a `2.0.0-next.N`
      build.** Nothing published yet. This is the only remaining item that can
      still surface a design mistake while it is cheap to fix
- [x] Migration guide lists every rename and every intentional behaviour change -
      `apps/site/src/content/docs/migrating-to-2-0.mdx`
- [ ] `pnpm changeset pre exit`
- [ ] `main` merged into `v2` and CI green **after** that merge, not before

### Also done, beyond the original checklist

- [x] ADRs 016 / 017 / 018 moved off Proposed, each recording where the
      implementation diverged from the plan
- [x] `ROADMAP.md` and `TODO.md` reconciled: horizontal reels, mixed direction
      and roll-up all close
- [x] `CLAUDE.md`'s invariant replaced (`ReelMotion` wraps via `_maxY`/`_minY`
      is no longer true) with *travel changes motion; facing changes art; they
      never change each other*
- [x] `pnpm build` green for the library (the example apps moved to their own repo)

---

## 6. Rollback

The bulk approach is genuinely better here: `v2` → `main` is one merge commit, so
`git revert -m 1 <sha>` undoes the entire release. Twelve incremental breaking releases would each need
unwinding separately.

The cost is granularity — you cannot revert "just the rename" and keep the motion rewrite. Since
everything ships in one release, a targeted revert means cherry-picking the offending PR out of `main`
after the fact, which is why per-PR commits on `v2` matter beyond review: they stay individually
revertable after the merge.

---

## 7. `debugOverlay` — the visual debug layer

`enableDebug` already ships `showMask(enabled)` (`debug/debug.ts`), which draws the mask bounding box
and per-reel rects into `viewport.unmaskedContainer`. It is a boolean, it is the only visual debug in
the library, and it draws *inside* the viewport so the spotlight container renders over it.

Replace it with a layered overlay. This is not gold-plating for a refactor whose entire subject —
which way a strip travels — is invisible in a canvas, and whose reviewers include agents that
`CLAUDE.md` explicitly says cannot see the canvas.

### API

```ts
const overlay = debugOverlay(reelSet, {
  layers: ['cells', 'axis', 'bounds'],   // or 'all'
  live: true,                            // redraw each tick; false = draw once
});

overlay.setLayers(['cells', 'pins']);
overlay.redraw();
overlay.destroy();
```

Also reachable as `__PIXI_REELS_DEBUG.overlay(...)`, alongside `snapshot()` / `grid()` / `trace()`.

### Layers

| Layer | Draws | Catches |
|---|---|---|
| `mask` | Mask bounding box + per-reel rects | Pyramid peek; `SharedRectMaskStrategy` auto-pick on the wrong axis (ADR 016 §6.5) |
| `cells` | Every visible cell from `getCellBounds`, with cell-index labels | Off-by-one after the row→cell rename |
| `buffers` | The off-window strip cells, dimmer | Buffer targets and big-symbol tails — currently invisible, and where a lot of the bugs live |
| `axis` | **One arrow per reel along the travel axis, pointing the way it goes** | The whole point. Reverse polarity and horizontal orientation become obvious instead of inferred |
| `feed` | A marker on the edge new symbols enter from | Confirms `feedEdge` derives correctly from polarity rather than being set twice |
| `thresholds` | The `minMain` / `maxMain` wrap lines | Contract L7 — you can watch a symbol reach the line and see whether it wraps |
| `bounds` | Actual `view.getBounds()` per symbol | Spine overrun. `BoardGrid.ts:135-137` already forces `SharedRectMaskStrategy` per cell because of exactly this |
| `blocks` | `getBlockBounds` outline for big symbols | 2×2 anchors, and the w/h→width/height transposition in ADR 016 §6.7 |
| `pins` | Pin cells and pin-overlay positions | The `movePin` / `_pinOverlayCellY` disagreement (A1) — you can see the two disagree |
| `hud` | Per-reel text: orientation, direction, gravity, phase, speed | Reading state without opening the console |

### Implementation notes

- Draw into a container added to the **`ReelSet` itself**, not `viewport.unmaskedContainer`. `ReelSet`
  extends `Container`, so that puts the overlay above the viewport — including above
  `spotlightContainer`, which the current `showMask` renders under.
- `live: true` drives redraw through **`TickerRef`**, not a raw `ticker.add`. The repo has the
  primitive; `CLAUDE.md` says do not invent a parallel.
- Implement `Disposable`. Every layer's `Graphics` is pooled and cleared, not recreated per frame.
- `mask`, `cells`, `buffers` and `thresholds` are static between reshapes — redraw them on
  `shape:changed` / `adjust:complete` rather than every tick. Only `bounds`, `pins` and `hud` need the
  live path.
- Dev-only, same caveat as `enableDebug`: it reads internals, it is not semver-protected, and it must
  not reach a production bundle.

### Why it splits across two PRs

**C3** ships `mask`, `cells`, `buffers`, `bounds`, `blocks`, `pins`, `hud`. None of those need
`ReelAxis`, so it has **no dependencies and can land on day one** — and then every subsequent PR is
reviewable with it.

**A11b** adds `axis`, `feed` and `thresholds` once `ReelAxis` is wired through `Reel` (A5), and extends
the `hud` line with orientation/direction/gravity.

Pair it with the Playwright suite in §5: a screenshot with the `axis` layer on, at each of the four
orientation × direction combinations, is the visual counterpart to contract laws L12 (isomorphism) and
L13 (mirror). The laws prove the numbers; the screenshots prove the picture.
