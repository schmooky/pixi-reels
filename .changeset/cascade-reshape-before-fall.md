---
"pixi-reels": patch
---

Fix: commit a MultiWays reshape BEFORE the fall in cascade (classic-tumble) mode when the target shape is known at spin time. `CascadeFallPhase` drops a reel's current visible rows, and the reshape used to run only after the fall (between SPIN and STOP, where standard mode's spin blur hides it), so in cascade mode a reel that changed height dropped its old, differently-sized board and then snapped to the new shape. a reel visibly changing height mid-tumble. Now, if `setShape()` is called BEFORE `spin({ mode: 'cascade' })`, the reshape commits before the fall so the reel falls at its target height. The legacy `spin()` then `setShape()` ordering is unchanged (the reshape still lands after SPIN). For a clean per-spin reshape in a classic tumble, call `setShape()` before `spin({ mode: 'cascade' })`.
