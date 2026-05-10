---
'pixi-reels': patch
---

`SpinController.skip()` now fires `onReelSpinEnd` and `onReelLanded` on every reel that hadn't already landed, regardless of which phase was active when the slam-stop arrived. Previously these symbol-level hooks fired only when the active phase happened to be `StopPhase` or `DropStopPhase` (their `onSkip()` called the notifications); a skip during `StartPhase` / `SpinPhase` / `AnticipationPhase` / `AdjustPhase` left visible symbols without an end-of-spin signal — most visibly, motion blur (or any other decoration attached in `onReelSpinStart`) stayed on the cell after the slam.

The notifications moved out of `StopPhase.onSkip` / `DropStopPhase.onSkip` into the controller so there's a single source of truth and no double-fire. Natural-stop flow is unchanged — those phases still fire the hooks themselves before the bounce.
