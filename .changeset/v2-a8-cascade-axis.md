---
"pixi-reels": patch
---

Refactor: the tumble cascade phases position symbols through the injected `ReelAxis`. `CascadeFallPhase` and `CascadeDropInPhase` read start positions via `axis.getMain`, write via `axis.setMain`, and build their GSAP tweens with a computed `axis.mainProp` key; fall/drop distances now carry `axis.polarity` so gravity follows the reel's travel axis. Grid origins (`originalRow * cellHeight`) stay direction-agnostic. Behavior is unchanged for the default vertical/forward axis (`mainProp: 'y'`, `polarity: 1`). `CascadePlacePhase` and `tumbleAlgorithm` were unaffected (visibility/identity swap and cell-index math, no position writes). Internal only.
