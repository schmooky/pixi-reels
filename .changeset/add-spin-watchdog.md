---
"pixi-reels": minor
---

Add: `SpinOptions.signal` (AbortSignal) and `SpinOptions.timeoutMs` (watchdog). A spin whose result never arrives can no longer hang forever — aborting the signal or exceeding the timeout rejects the `spin()` promise and force-stops the reels to a clean grid. `signal` rejects with `signal.reason` when it is an `Error`, so a failed/cancelled fetch propagates directly.
