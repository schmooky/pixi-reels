# Architecture Decision Records

ADRs for pixi-reels. Each one captures a decision that shapes how the code is written. Read in order the first time through.

| # | Title | Status |
|---|---|---|
| [001](./001-builder-pattern.md) | Builder pattern for ReelSet construction | Accepted |
| [002](./002-typed-event-emitter.md) | Custom typed event emitter | Accepted |
| [003](./003-spin-lifecycle.md) | Decoupled spin/result lifecycle | Accepted |
| [004](./004-disposable-tickerref.md) | Disposable pattern + TickerRef for memory safety | Accepted |
| [005](./005-symbol-plugins.md) | Symbol plugin architecture | Accepted |
| [006](./006-debug-mode.md) | AI-friendly debug mode | Accepted |
| [007](./007-scope.md) | **Scope — what pixi-reels is, and what it is not** | Accepted (load-bearing) |
| [008](./008-deterministic-testing.md) | Deterministic testing harness | Accepted |
| [009](./009-cheats-live-outside-lib.md) | Cheats live outside the library | Accepted |
| [010](./010-cascade-physics.md) | Cascade physics — per-survivor fall distance | Accepted (load-bearing) |
| [011](./011-spine-subpath-and-vocabulary.md) | Spine subpath export + canonical animation vocabulary | Accepted |

## Writing a new ADR

1. Copy an existing file as a template.
2. Number it sequentially (012, 013, …).
3. Status is one of: `Proposed` / `Accepted` / `Superseded by #NNN`.
4. Mark it **load-bearing** if reversing the decision would break consumers or invalidate tests.
5. Link it in the table above.
6. Open a PR. ADRs don't need a changeset — they're not code.

## What an ADR is not

An ADR is not a feature design doc and it is not an API reference. It is one decision, its context, and its consequences — in a few hundred words. If an ADR runs over 800 words, it probably contains two decisions and should be split.
