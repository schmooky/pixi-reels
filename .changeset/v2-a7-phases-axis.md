---
"pixi-reels": patch
---

Refactor: route the non-cascade spin phases' GSAP position tweens through `reel.axis` instead of a hardcoded `.y`. StopPhase's landing bounce now overshoots in the direction of travel via `base + axis.polarity * bounceDistance` on `axis.mainProp`, and reads/restores the reel container's base position through `axis.getMain`/`setMain`. AdjustPhase's MultiWays pin-overlay squash and slide now write `scale[axis.mainProp]` and position via `axis.setMain`/`setCross`. StartPhase's step-back is a speed tween (already direction-relative through the motion layer) and is unchanged. Vertical/forward is byte-identical.
