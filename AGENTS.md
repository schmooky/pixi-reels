# AGENTS.md

Instructions for AI agents (Claude, Codex, Cursor, etc.) and human contributors working in this repo. Read the whole file before touching anything. It is short on purpose.

---

## 1. What this repo is

`pixi-reels` is a **reel engine for PixiJS v8**. It animates slot symbols moving on reels and emits typed events describing that lifecycle. One monorepo with three surfaces:

```
packages/pixi-reels/   <- the published library (npm: pixi-reels)
apps/site/             <- the docs site (pixi-reels.dev, not published)
examples/              <- three example apps + shared reference code (not published)
```

The library builds to two entry points:
- `pixi-reels` — core (reel set, phases, symbols, events, testing, debug).
- `pixi-reels/spine` — Spine 2D symbols with the Bonbon animation vocabulary.

Everything else — cheats, cascade loop, seeded RNG, mock server, Spine loaders — lives in `examples/shared/`. It is reference code, copy-pasteable, **not library API**.

---

## 2. What this repo is NOT

Read [ADR 007 — Scope](./docs/adr/007-scope.md) for the full list. The short version:

| Out of scope | Why | Where it belongs |
|---|---|---|
| Win detection (lines, clusters, scatters) | Game-specific rules | Consumer code / server |
| Paytable math | Regulated money math | Server |
| Multiplier / RTP math | Same | Server |
| RNG / outcome selection | `setResult(grid)` is the inbound interface | Server, or `CheatEngine` in examples |
| Audio | Every exit path emits events; wire audio to those | Consumer audio layer |
| Bonus state machines (FS, Hold & Win) | The library provides the primitives; the state machine is game code | Consumer code; see `ScatterFsDemo.tsx` for a primitive shape |
| UI / HUD | The library is a `PIXI.Container`. You place it. | Consumer UI |
| Accessibility | Canvas has no ARIA surface; consumer's DOM UI owns a11y | Consumer DOM |
| i18n | No user-facing strings in the library | Consumer |

**If a request, PR, or feature idea lives in the right column, decline it. Point the asker at the corresponding ADR or `docs/BEST_PRACTICES.md`.**

---

## 3. Repo layout (mental model)

```
pixi-reels/
├── packages/pixi-reels/           the library
│   ├── src/
│   │   ├── core/                  ReelSet, Builder, Reel, Viewport, Motion, StopSequencer
│   │   ├── spin/                  SpinController, phases (Start/Spin/Anticipation/Stop), spinning modes
│   │   ├── symbols/               ReelSymbol (abstract) + Sprite / AnimatedSprite / Spine / Headless
│   │   ├── speed/                 SpeedManager, speed profiles
│   │   ├── frame/                 FrameBuilder, middleware pipeline, RNG
│   │   ├── spotlight/             SymbolSpotlight (win animations)
│   │   ├── events/                typed EventEmitter, event type definitions
│   │   ├── utils/                 Disposable, TickerRef
│   │   ├── testing/               FakeTicker, HeadlessSymbol, createTestReelSet, harness
│   │   ├── spine/                 SpineReelSymbol (Bonbon vocabulary) -> subpath export
│   │   ├── debug/                 debugSnapshot, debugGrid, enableDebug
│   │   └── index.ts               the only public barrel
│   └── tests/                     vitest (unit + integration)
├── examples/
│   ├── shared/                    cheats, cascade loop, seeded RNG, spine loaders, mock server
│   ├── classic-spin/              5x3 line pays
│   ├── cascade-tumble/            6x5 cascade
│   ├── hold-and-win/              hold-and-win respin
│   └── assets/                    prototype-symbols sprite atlas
├── apps/site/                     Astro + shadcn docs site
├── docs/
│   ├── adr/                       architecture decision records
│   └── BEST_PRACTICES.md          developer guide
├── scripts/                       release + size + fancy-unicode guard
└── .github/                       workflows + templates
```

If your change would create a file outside the tree above, stop and think. There is probably a better home.

---

## 4. Load-bearing invariants

Break any of these and the build, the tests, or real consumers break. They are enforced by lint guards, tests, or code review.

- **No default exports.** Always named. Tree-shaking depends on this.
- **`.js` extensions in imports.** Even from `.ts`. Node ESM resolution requires it.
- **Only `src/index.ts` is a barrel.** Subdirectories do not re-export. The Spine subpath barrel (`src/spine/index.ts`) is the single exception.
- **`Disposable` on anything that allocates.** `destroy()` + `isDestroyed`. Wired into `ReelSet.destroy()`'s cascade.
- **`TickerRef`, never `ticker.add()` directly.** The wrapper tracks callbacks and auto-removes on destroy.
- **Events use colon namespacing**: `spin:start`, `spin:reelLanded`, `speed:changed`. Never camelCase, never dot-separated.
- **Per-survivor fall distance in cascades.** `tumbleToGrid` must not move a cell whose computed fall distance is zero. Enforced by `tests/integration/cascadeLoop.test.ts`. See [ADR 010](./docs/adr/010-cascade-physics.md).
- **`CheatEngine` applies `_held` on every output.** Sticky-wild persistence is a feature of the engine, not of individual cheats. [ADR 009](./docs/adr/009-cheats-live-outside-lib.md).
- **`pixi-reels` main barrel stays small.** Size baseline lives in `ci/size-baseline.json`; the build-check workflow reports deltas.
- **ASCII punctuation.** No emoji, no smart quotes, no drift from autocorrect. The `scripts/check-no-fancy-unicode.mjs` guard runs in CI + as pre-commit on staged files.

---

## 5. House style

- **Simplicity first.** The minimum code that solves the problem. If you write 200 lines and it could be 50, rewrite.
- **Surgical changes.** Touch only what you must. Don't improve adjacent comments or formatting. Every changed line should trace to the task.
- **Comments explain why.** The code already says what. Comments capture non-obvious reasons.
- **One logical change per PR.** A fix and a refactor are two PRs.
- **No emoji. ASCII punctuation only.** In source, commit messages, changelog entries, and UI strings.
- **Named exports for types** too: `export type { Foo }`, not `export { type Foo }`.
- **Tests are named after behaviour, not implementation.** `it('lands the target grid when setResult runs mid-spin', ...)` beats `it('_tryBeginStopSequence gates on _resultSymbols', ...)`.

---

## 6. DO / DON'T

### DO

```ts
// Compose, don't subclass.
const reelSet = new ReelSetBuilder()
  .reels(5).visibleSymbols(3).symbolSize(140, 140)
  .symbols((r) => r.register('cherry', SpriteSymbol, { textures: { cherry } }))
  .ticker(app.ticker)
  .build();
app.stage.addChild(reelSet);
```

```ts
// Listen to events. Every exit path goes through them.
reelSet.events.on('spin:complete', (result) => hud.showWin(result.symbols));
reelSet.events.on('skip:completed', () => audio.stopSpinLoop());
```

```ts
// Import Spine symbols from the subpath.
import { SpineReelSymbol } from 'pixi-reels/spine';
```

```ts
// Test mechanics with the headless harness.
const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
await h.spinAndLand(grid);
expectGrid(h.reelSet, grid);
h.destroy();
```

### DON'T

```ts
// No default exports.
export default class Foo {}         // wrong
```

```ts
// No subdirectory barrels.
// src/core/index.ts
export * from './ReelSet.js';        // wrong
```

```ts
// No raw ticker.add.
app.ticker.add((ticker) => myUpdate(ticker));   // wrong; use TickerRef
```

```ts
// No reinventing the engine.
class SpinManager { /* ... */ }     // wrong; you already have ReelSet
```

```ts
// No win math in the library.
// packages/pixi-reels/src/wins/detectLineWins.ts    wrong; out of scope
```

```ts
// No cheat code in the library.
// packages/pixi-reels/src/cheats/CheatEngine.ts     wrong; lives in examples/shared/
```

---

## 7. Common tasks

### Add a new symbol class

1. `packages/pixi-reels/src/symbols/MySymbol.ts` extending `ReelSymbol`.
2. Implement `onActivate`, `onDeactivate`, `playWin`, `stopAnimation`, `resize`.
3. `resize()` **must** store dimensions and reposition every child. Called on every pool acquisition.
4. Export from `src/index.ts`.
5. Write a test in `tests/unit/symbols/MySymbol.test.ts` using `createTestReelSet`.

### Add a new spin phase

1. `packages/pixi-reels/src/spin/phases/MyPhase.ts` extending `ReelPhase<TConfig>`.
2. `onEnter`, `update`, `onSkip`. Call `this._complete()` when done.
3. Register via `builder.phases((f) => f.register('myPhase', MyPhase))`.
4. Add a test asserting the phase runs from the correct trigger.

### Add a new speed profile

1. `packages/pixi-reels/src/config/SpeedPresets.ts`, or at runtime: `reelSet.speed.addProfile('name', profile)`.
2. No test required — it's data.

### Add a frame middleware

1. Implement `FrameMiddleware` (name, priority, process). Random-fill is priority 0, target-placement is 10. Pick a priority that makes intent obvious.
2. Register via `builder.frameMiddleware(new MyMiddleware())`.
3. Test: construct with middleware, call `frameBuilder.build(...)`, assert resulting symbol array.

### Add a new recipe or demo to the site

1. **Never** add it to the library. Recipes and demos live in `apps/site/src/components/`.
2. Reuse `examples/shared/cheats.ts`. Extend it if you need a new cheat — don't define one inline in the demo.
3. Write the MDX in `apps/site/src/pages/recipes/` or `apps/site/src/pages/demos/` with frontmatter (title, subtitle, tags, steps).
4. Update `apps/site/src/content/*.ts` metadata if adding to a gallery.

### Add or modify a cheat

1. Edit `examples/shared/cheats.ts`.
2. Cheat output must be deterministic given the same seed. No `Math.random()`.
3. Add a test in `tests/integration/cheats.test.ts`.

---

## 8. Before you declare done

Run these. All must pass.

```bash
pnpm check:lint                          # fancy-unicode guard
pnpm --filter pixi-reels typecheck       # tsc --noEmit
pnpm --filter pixi-reels test            # 96+ vitest
pnpm --filter @pixi-reels/site build     # 46+ static pages
```

If your change affects a publishable package, add a changeset:

```bash
pnpm changeset
```

See [`.changeset/README.md`](./.changeset/README.md) for the flow.

---

## 9. Debugging production-canvas issues as an agent

PixiJS renders to canvas — you can't "see" it. Use the debug module:

```ts
import { enableDebug } from 'pixi-reels';
enableDebug(reelSet);                    // attaches window.__PIXI_REELS_DEBUG
```

In the browser console (or via `preview_eval`):

```js
__PIXI_REELS_DEBUG.log()        // ASCII grid + state
__PIXI_REELS_DEBUG.snapshot()   // full JSON state
__PIXI_REELS_DEBUG.trace()      // log every domain event as it fires
```

[ADR 006](./docs/adr/006-debug-mode.md) documents the shape of the snapshot. No PixiJS types in the output — it is plain JSON, safe to `JSON.stringify`.

---

## 10. When in doubt

1. Read the relevant ADR. Index at [`docs/adr/README.md`](./docs/adr/README.md). **ADR 007 (Scope) is mandatory reading.**
2. Check the site at [pixi-reels.dev](https://pixi-reels.dev) — `/architecture/` has visual explainers, `/recipes/` has single-idea how-tos.
3. Write a test that reproduces what you're trying to do. If you can't, you probably don't understand the problem yet.
4. Ask before speculating. Describe what you'd do and why, and wait for a go. Silent guesses are the source of every bad PR.

---

## 11. The four behavioural rules

These apply to every AI agent on this repo. No exceptions.

1. **Think before coding.** State assumptions. If multiple interpretations exist, present them. If something is unclear, stop and ask.
2. **Simplicity first.** The minimum that solves the problem. Nothing speculative, no "flexibility" you weren't asked for.
3. **Surgical changes.** Touch only what you must. Don't improve adjacent code. Every changed line traces to the task.
4. **Goal-driven execution.** Every task becomes a verifiable goal. State a brief plan with `verify:` checks per step. Loop until green.

Strong success criteria let you loop independently. Weak criteria require clarification from the user. Always ask for the former.

---

## 12. Conventional Commits + Changesets — the release flow

Every commit on this repo is linted as a Conventional Commit. The commit
message controls the SEO of the resulting PR and informs the release notes;
the **changeset** controls the actual npm version bump. They are two
separate signals that tell the same story.

### Commit message

Format: `<type>(<scope>)!: <subject>`

Types:
- `feat` — new user-visible feature (minor bump)
- `fix` — bug fix (patch bump)
- `perf` — perf improvement (patch bump)
- `refactor` — internal refactor (patch bump or skip)
- `docs` / `test` / `build` / `ci` / `chore` — no release
- `!` before the colon, or a `BREAKING CHANGE:` footer — major bump

Examples:
```
feat(spin): slam-stop now fires skip:completed before spin:complete
fix(reel): release pooled symbols when the reel is destroyed
refactor(frame)!: FrameMiddleware.process now returns string | null
chore: bump vite to 8.1
```

### Writing a changeset

When your PR ships a user-visible change:

```bash
pnpm changeset
```

Pick the package(s) and the bump level, then write a short, past-tense
sentence aimed at a consumer reading the changelog. The generated
`.changeset/*.md` file is committed as part of your PR.

Full rules live in [`.changeset/README.md`](./.changeset/README.md) — bump
type, what to skip, how internal-dep cascades work.

### What happens after merge to `main`

1. The release workflow (`.github/workflows/release.yml`) sees a pending
   `.changeset/*.md` and opens a **"Version Packages"** PR that applies the
   bumps, regenerates each affected package's `CHANGELOG.md`, and deletes
   the consumed changeset files.
2. When a maintainer merges the Version Packages PR, the same workflow runs
   a second time; this time there are no pending changesets, so it runs
   `pnpm release` (topological build + `changeset publish`) and publishes
   every newly-bumped package to npm with signed provenance.

### What happens on non-`main` branches

Every push triggers `snapshot.yml` which publishes
`pixi-reels@<base>-<branch-tag>-<sha>` under a per-branch dist-tag. No
changeset? The script writes a throwaway one for the run and deletes it
after. Reviewers install your WIP with:

```bash
pnpm add pixi-reels@<branch-tag>
```

A nightly cron also runs at 03:00 UTC against the default branch so the
`nightly` dist-tag is always current.

---

## 13. Agent skills — Karpathy's advice applied to this repo

Andrej Karpathy's heuristics for coding agents translate directly to
`pixi-reels`. These are not novel — they are the same rules the house
style enforces, framed the way an agent reads them.

**1. Work like a pair-programming peer, not an autocomplete.** Before you
edit, state what you plan to do, which files you expect to touch, and what
"done" looks like. If that plan is a page long, the task is under-specified
— push back and ask for a smaller goal. The four rules in section 11 are the
concrete shape of this.

**2. Small, reversible steps.** One commit per logical change. One PR per
commit group. Never bundle a refactor with a feature. If your diff spans
two intents, split it. Prefer "land a small thing today" over "nail the
big thing in three days". Each step should leave `pnpm test` + `pnpm
typecheck` green.

**3. Treat evals as ground truth.** `vitest` is the test harness; reach
for it before you reach for the canvas. If you can't write a failing
test that reproduces the request, you do not yet understand the request
— stop and clarify. The headless harness in `src/testing/` exists for
this: a spin runs in Node, no renderer. Use `createTestReelSet` instead
of "let me poke it in the browser".

**4. Read the code, not your intuition.** A memory of what a function did
last week is not the same as the code today. Before you change a file,
read it. Before you claim an API exists, `grep` for it. The system is
small enough (~10 kLoC) that re-reading is always cheaper than guessing
wrong.

**5. Keep the primitives tiny; let the caller compose.** The library
intentionally refuses to ship paytables, audio, or bonus state machines
([ADR 007](./docs/adr/007-scope.md)). Resist the urge to add a "helper"
that couples two primitives. Two primitives plus three lines of glue
in the consumer is better than one opinionated API that the next user
has to fight.

**6. Favour explicit data flow over implicit state.** The spin pipeline
is a state machine driven by `setResult(grid)` — an explicit input. If
your change introduces a hidden queue, a shared flag, or "the controller
remembers this for next spin", you have introduced a bug waiting to
happen. Pass the state through the API, not through the class.

**7. Verification is part of the deliverable.** "I think it works" is not
done. A done task has:
- tests you added or updated
- `pnpm --filter pixi-reels typecheck` green
- `pnpm check:lint` green
- a changeset (if user-visible)
- a commit message that reads like a release note

**8. When stuck, narrow the surface.** If a test is failing in a
mysterious way, reduce the scenario until the smallest thing that still
fails. `FakeTicker` gives you deterministic frame stepping — use it to
binary-search the bug. Don't `console.log` your way through 100 ticks.

**9. The `__PIXI_REELS_DEBUG` handle is mandatory.** You cannot see a
canvas. `enableDebug(reelSet)` attaches a JSON/ASCII snapshot to
`window.__PIXI_REELS_DEBUG`. Call `.log()`, read the grid, reason about
what changed. Trying to debug by staring at the screen you can't see is
the fastest way to guess wrong.
