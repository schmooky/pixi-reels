---
'pixi-reels': patch
---

Fix: a reel that teased during a tumble spin never came to rest. `AnticipationPhase` tweens `reel.speed` UP, and the tumble stop path never brings it back down - `cascade:place` swaps symbol identities and `cascade:dropIn` tweens views, and neither touches `reel.speed` the way `StopPhase._landAndBounce` does. So in any cascade game calling `setAnticipation()`, every teasing reel was left running at the tease speed after the round ended, drifting further off-grid every frame for the rest of the session while the untouched reels stayed put.

Two changes. A tumble tease is now a pure hold: the reel has already dropped its visible symbols and is sitting at zero, so scrolling it would drag buffer symbols back through the empty window, and the multiplier is pinned to `0` there whatever the `slowdown` curve says. And a tumble reel is brought to rest and snapped to the grid before the place phase, which holds the invariant even when a custom `'anticipation'` phase is registered and does move the reel.

Strip spins are unaffected: `StopPhase` was always resting the reel there, which is why this only ever showed up in cascades.
