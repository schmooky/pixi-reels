# ADR 008: Deterministic testing harness

## Status: Accepted (updated 2026-05-29 — the harness now ships at the `pixi-reels/testing` subpath, not the main barrel)

## Context

Testing a slot reel library has two hard parts: the PixiJS ticker (drives time) and the renderer (draws nothing in Node). Most slot codebases solve this by not testing the reel layer at all — they wrap it in adapters and test the adapters. We want tests that exercise the real `ReelSet`, real `SpinController`, real events — just without a renderer and without wall-clock time.

## Decision

Ship a dedicated testing sub-module at `packages/pixi-reels/src/testing/` exporting three primitives:

1. **`FakeTicker`** — duck-compatible with `PIXI.Ticker` (`add` / `remove` / `deltaMS`). Manual `tick(ms)` advances time deterministically.

2. **`HeadlessSymbol`** — extends `ReelSymbol`, creates a `PIXI.Container` for `view` so scene-graph code works, but renders nothing. Slots into `SymbolFactory` identically to `SpriteSymbol` et al.

3. **`createTestReelSet({ reels, visibleRows, symbolIds })`** — builds a `ReelSet` wired to a `FakeTicker` with `HeadlessSymbol` for every id. Returns a handle with:
   - `reelSet` — a real `ReelSet`
   - `ticker` — the `FakeTicker`
   - `advance(ms)` — drive time
   - `spinAndLand(grid)` — `spin() → setResult(grid) → skip()` as a single synchronous call
   - `destroy()` — teardown

Plus utilities:

- `expectGrid(reelSet, expectedGrid)` — diff-friendly grid assertion with readable error output (uses `debugGrid`).
- `captureEvents(reelSet, eventNames[])` — logs fired events in order for assertion.
- `countSymbol(reelSet, id)` — visible count, handy for scatter-style tests.

The whole module is tree-shakeable — production bundles drop it.

### Why `spinAndLand` uses `skip()`

`skip()` force-completes every active phase (including GSAP timelines), calls `reel.placeSymbols(targetRow)` directly, and fires the usual event sequence. The spin promise resolves on a microtask. This is how the test suite can assert full spin outcomes without driving a ticker — and it exercises the same `skip()` code path a real player hits when they slam-stop.

### Why `HeadlessSymbol` is not a mock

It's a real `ReelSymbol` subclass. `Reel` doesn't know the difference between `HeadlessSymbol` and `SpriteSymbol`. Tests therefore exercise the actual symbol lifecycle (pool → activate → resize → deactivate → release). If a future change broke the lifecycle, the testing module would be the first to fail.

## Consequences

### Positive

- 96 tests run in Node in under half a second. Every PR runs them in CI.
- The library's own `StopPhase` slicing bug (regression test in `tests/integration/stop-phase.test.ts`) was caught and fixed with this harness.
- Cascade physics invariants (ADR 010) are enforced by tests that exercise `reelSet.runCascade` and `computeDropOffsets` against real reel sets.
- Consumers can use the same harness to test their own mechanics — `createTestReelSet` is public API.

### Negative

- The harness cannot exercise asynchronous spin-phase timing. A test that wants to watch a reel mid-SPIN cannot — `skip()` is all-or-nothing. For timing-sensitive visual regressions, rely on the site's preview + browser verification.
- The testing module is split out via the `./testing` subpath, so it is not counted against the main bundle unless a consumer imports from `pixi-reels/testing`. (Originally exported from the main barrel; moved to a subpath in 1.0.0.)

## Verification

```ts
import { createTestReelSet, expectGrid, captureEvents } from 'pixi-reels/testing';

const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
try {
  const log = captureEvents(h.reelSet, ['spin:start', 'spin:complete']);
  const result = await h.spinAndLand([
    ['a','a','a'], ['b','b','b'], ['c','c','c'], ['a','b','c'], ['c','b','a'],
  ]);
  expect(result.wasSkipped).toBe(true);
  expectGrid(h.reelSet, /* same grid */);
  expect(log.map((e) => e.event)).toEqual(['spin:start', 'spin:complete']);
} finally {
  h.destroy();
}
```
