# ADR 009: Cheats live outside the library

## Status: Accepted

## Context

The docs site has six live mechanic demos, six recipes, and four Spine demos. Each needs a way to *force specific outcomes* so the demo actually shows its advertised mechanic instead of RNG noise. A published slot game would never ship cheats in the consumer bundle, so we can't put them in the library. But every demo and recipe test needs them, so they can't live inside each demo either — duplication hell.

Separately, sticky wilds, hold-and-win, and any "persisted cell across spins" mechanic needs a way to carry cells forward that survives any cheat or RNG output. We had three options: make every cheat respect `held` by convention (fragile), build it into the demo runtime (couples demos), or push it down into the `CheatEngine` itself.

## Decision

**Cheats live in `examples/shared/cheats.ts`. They are never published as library API.**

The cheats library exposes:

- **`CheatEngine`** — owns a seeded RNG (Mulberry32), a `held` cell list, and an ordered list of cheat definitions. `engine.next()` produces the next outcome, trying each enabled cheat in order; the first one that returns a non-null result wins.
- **Built-in cheats** — `forceGrid`, `forceLine(row, id)`, `forceScatters(n, id)` (exact count — see note below), `forceNearMiss(n, id, nearReel)`, `forceCell(reel, row, id)`, `holdAndWinProgress(coinId, chance)`, `cascadeSequence(stages)`, `cascadingStages(stages)`, `forceAnticipation(reelIndices)`.
- **`CheatDefinition`** — `{ id, label, description?, enabled, cheat }`. Demos render these as a toggle panel (`CheatPanelReact`).

### Held-cell persistence is a CheatEngine feature, not a per-cheat feature

`CheatEngine.next()` applies `this._held` on top of **every** cheat result (and on the random-fallback path) via a private `_applyHeld(grid)`. Any cell in `held` overwrites whatever the cheat produced.

This makes sticky wilds, hold & win, and any "freeze this cell until further notice" mechanic trivially composable with any cheat. `setHeld([...])` before each spin; the engine handles the rest.

### `forceScatters(n, id)` produces *exactly* N

It fills the random grid using the non-scatter pool only, then writes exactly `n` cells to the scatter id. Callers can assert `countSymbol(reelSet, id) === n` after landing. Important: if `forceScatters` filled from the full pool, a scatter at weight = 5 would sometimes push the visible count to N+2 or N+3 — making mechanic tests flaky.

## Consequences

### Positive

- Published library stays lean. No cheat code ships to production.
- One shared cheat surface across demos, recipes, Spine demos, and mechanic tests. Written once, toggleable everywhere.
- Held-cell persistence composes with every cheat automatically. Adding a new cheat never needs to remember to honour `held`.
- Seeded RNG means two runs with the same seed produce identical output — deterministic screenshots, deterministic tests.

### Negative

- Tests for the cheats live in the library's test tree (`tests/integration/cheats.test.ts`), which reaches across the `examples/shared/` boundary. That's a concession for having a single source of truth; the alternative (a third test package) is worse.
- Cheats are documented on the site (`/guides/cheats-and-testing/`), which may confuse adopters into thinking they're shipped. The guide is explicit they live in `examples/shared/`.

## Rules

- **No cheat code may ever reach `packages/pixi-reels/src/`.**
- If a user opens a discussion asking for "a cheat panel in the library" — decline, point at `examples/shared/cheats.ts`.
- If a new demo needs a cheat, extend `cheats.ts`. Don't define ad-hoc cheats inline in the demo.
- Cheat output must be deterministic given the same seed. New cheats that depend on `Math.random()` are rejected.

## Verification

```ts
import { CheatEngine, forceLine } from '@/shared/cheats';

const engine = new CheatEngine({
  reelCount: 5, visibleRows: 3,
  symbolIds: ['a', 'b', 'c', 'wild'], seed: 1,
});
engine.register({ id: 'ln', label: 'line', enabled: true, cheat: forceLine(1, 'a') });
engine.setHeld([{ reel: 2, row: 1, symbolId: 'wild' }]);

const { symbols } = engine.next();
// Held cell (2, 1) is 'wild' even though the cheat wanted 'a' on row 1.
expect(symbols[2][1]).toBe('wild');
// The other four row-1 cells are 'a' as the cheat intended.
for (const r of [0, 1, 3, 4]) expect(symbols[r][1]).toBe('a');
```
