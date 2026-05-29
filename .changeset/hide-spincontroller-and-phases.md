---
"pixi-reels": major
---

Hide `SpinController`, `SpinControllerHooks`, and the built-in phase classes (`StartPhase`, `SpinPhase`, `StopPhase`, `AnticipationPhase`, `AdjustPhase`, `CascadeFallPhase`, `CascadePlacePhase`, `CascadeDropInPhase`) from the package entry — they are internal wiring. Register custom phases by extending `ReelPhase` and calling `builder.phases(f => f.register(...))`. Phase config TYPES (`StartPhaseConfig`, etc.) remain exported.
