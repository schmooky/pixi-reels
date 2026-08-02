---
'pixi-reels': patch
---

Fix (codemod): `v1-to-v2` rewrote `offsetY` on every member expression, so a consumer's `event.offsetY` became `event.mainOffset` and their input handling broke silently. It now only renames `offsetY` when the receiver looks like a reel. The header comment claimed this restraint already existed; it does now.
