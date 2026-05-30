---
"pixi-reels": patch
---

Fix: `SymbolSpotlight.cycle()` now actually cycles. It previously aborted its own signal on the first line (because `show()` called `hide()`), flashing only the first win line for zero time and ignoring `displayDuration` / `gapDuration` / `cycles`. Teardown between lines is now separated from the cycle-abort, and `hide()` still interrupts a running cycle promptly.
