---
'pixi-reels': patch
---

Fix: `SpinTextureCache` no longer destroys a texture another reel is still drawing. It kept one capture per symbol id, so on a MultiWays set, where every reel sizes the same id differently, each reel's capture at its own cell size destroyed the one the previous reel was spinning on and the next render crashed on a destroyed texture. Captures are now keyed by id and cell size (and smear axis for blurred ones), sizes are kept side by side, and `clear()` / `invalidate()` / `destroy()` remain the only calls that destroy them. `getStatic()` / `getBlurred()` take an optional size to read one capture; without it they return the most recent, as before. Sizes are compared to a thousandth of a pixel, so one cell size reached along two float paths (`111.65` and `111.65000000000002`) is one capture and a prewarmed texture is found. `captureBlurred()` blurs only the provided static or the capture at its own size, and throws rather than stretch a capture of another size into a cached blur.

`StaticSpinSymbol` now spins every reel on the snapshot of its own cell size, and a MultiWays reshape mid-spin re-points the snapshot at the new size instead of stretching the old one. To prewarm a MultiWays set, call `prewarmSpinTextures` once per cell size the reels can land on.
