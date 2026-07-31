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

### Scheduling notes

- **The long pole is A4 → A5 → A12 → A19.** Everything else slots around it.
- **Start B1 immediately, alongside A1 and A2.** It is the only item that makes the refactor *smaller*,
  and it gates A12.
- **A3 gates verification for A4–A11.** Land it early or those PRs have no gate to pass.
- **A1 must precede A3**, or the golden master freezes a known bug (ADR 018 §10.1).
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
pnpm --filter pixi-reels test
pnpm --filter pixi-reels test:contract      # all four orientation x direction combos
pnpm check:lint
.changeset/*.md present
```

Plus, for A4–A11 only: golden masters within **1e-6**, and every diff above 1e-9 must sit on a slot
boundary with a line in the PR body naming which contract law the old value violated. This is not
byte-identity — ADR 018 §4.2 explains why byte-identity would enforce the L7 defect.

Plus, from A5 onward: the no-raw-position lint rule (ADR 018 §5.4).

---

## 5. Merge checklist — `v2` → `main`

- [ ] Contract green on all four combos
- [ ] Golden masters green under §4's tolerance, with every boundary diff enumerated
- [ ] Playwright visual green on `classic-spin`, `cascade-tumble`, both horizontal recipes
- [ ] Codemod run against `examples/` and `apps/site/` with zero manual fixups
- [ ] At least one external consumer has upgraded from a `2.0.0-next.N` build
- [ ] Migration guide lists every rename and every intentional behaviour change
- [ ] `pnpm changeset pre exit`
- [ ] `main` merged into `v2` and CI green **after** that merge, not before

---

## 6. Rollback

The bulk approach is genuinely better here: `v2` → `main` is one merge commit, so
`git revert -m 1 <sha>` undoes the entire release. Twelve incremental breaking releases would each need
unwinding separately.

The cost is granularity — you cannot revert "just the rename" and keep the motion rewrite. Since
everything ships in one release, a targeted revert means cherry-picking the offending PR out of `main`
after the fact, which is why per-PR commits on `v2` matter beyond review: they stay individually
revertable after the merge.
