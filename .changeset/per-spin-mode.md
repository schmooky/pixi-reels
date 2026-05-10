---
'pixi-reels': minor
---

`reelSet.spin()` accepts an optional `{ mode: 'standard' | 'cascade' }` argument that picks the phase chain for a single spin. Tumble-cascade slots can now do classic strip-spin + bounce on the first round and drop-in tumble on subsequent waves.

`.cascade(...)` on the builder still wires the drop-in phases — but they are now registered under `dropStart` / `dropStop` keys instead of overwriting `start` / `stop`. The default mode flips to `'cascade'` when `.cascade(...)` was called, so existing callers that just call `spin()` without args see no change.

Calling `spin({ mode: 'cascade' })` on a builder that didn't configure `.cascade(...)` throws a clear error. The new `SpinOptions` type is exported from the package barrel.
