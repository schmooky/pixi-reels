---
'pixi-reels': patch
---

Fix: `ReelSetBuilder.bufferSymbols(count)` now clamps `0`, negative numbers, `NaN`, and non-finite values to the minimum of 1, with a single console warning per process.

Buffer rows are off-screen cells the reel keeps around the visible window so symbols can fade/slide in cleanly. The motion layer's wrap detection assumes at least one buffer row above and one below — passing `0` would produce an inconsistent state that surfaced later as visible flicker on motion-wrap, not as a clear configuration error at build time.

The clamp is preferred over a thrown error so existing user code that accidentally passed `0` keeps running. The warning fires once per process (regardless of how many builders hit the bad value) so logs stay readable when a faulty default is wired into a loop.
