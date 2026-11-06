---
'pixi-reels': minor
---

Add: a `host` option on `debugOverlay` from `pixi-reels/debug`. The overlay draws into that container instead of the reel set and copies the set's transform onto itself before every render. Pass a container outside the camera window or frame mask your game puts around the set, so the mask does not clip the panels under the reels.
