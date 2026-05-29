---
"pixi-reels": major
---

Replace the inline-options-object signature of `ReelSet.refill()` with a typed `RefillOptions` interface and a `RefillResult` return type that mirrors `RunCascadeResult`. Adds `signal: AbortSignal` for mid-refill cancellation. The result now exposes `winnersRefilled`, `finalGrid`, `wasSkipped`, and `duration` (previously the misnamed `SpinResult` shape).
