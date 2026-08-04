---
"pixi-reels": minor
---

Add: `ReelSetBuilder.orientation()` / `direction()` / `directionPerReel()` and per-reel `ReelAxis` threading (plus a `reel.axis` accessor). The axis is wired through the motion + phase layers. Vertical forward is fully supported. `orientation('horizontal')` and any reverse direction fail loud at `build()` for now - their set-level geometry and the StopSequencer feed edge (ADR 016 section 6.1) land in a later commit, so failing loud beats a mis-laid or non-landing spin.
