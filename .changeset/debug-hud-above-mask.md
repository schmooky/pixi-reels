---
'pixi-reels': patch
---

Fix: the `hud` layer of `debugOverlay` no longer covers the reels. Its per-reel plaque now sits above the mask (and above the buffer cells and feed markers drawn there) instead of inside its top-left corner, so it grows the reel set's bounds the way the `metrics` and `timeline` panels below it do: fit your camera after turning it on.
