# ADR 003: Decoupled Spin/Result Lifecycle

## Status: Accepted

## Context

In real slot games, the spin animation starts before the server responds with results. The original library had no spin lifecycle — games built their own start→spin→stop flow independently.

## Decision

`reelSet.spin()` returns a Promise that resolves when all reels land. `reelSet.setResult(symbols)` is called separately when server data arrives. This decouples the visual spin from the data.

```
spin() starts → reels spinning → setResult() → reels stop → promise resolves
```

Anticipation is also set separately via `setAnticipation(reelIndices)`.

## Consequences

- **Positive**: Mirrors real network flow — spin starts, server responds, reels stop.
- **Positive**: Clean async/await pattern for game code.
- **Positive**: Skip/slam-stop integrates naturally (call `skip()` after `setResult()`).
- **Negative**: Must call `setResult()` before `skip()` — throws otherwise.
