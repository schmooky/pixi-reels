---
"pixi-reels": minor
---

Add: `attachReelSounds(reelSet, port, cues)` snaps a table of sound cues onto a reel set's events: a `spin` loop from `spin:start` to `spin:allLanded`, a `reelStop` one-shot per landing reel, an `anticipation` loop per teasing reel with a pitch that can climb by `order`, `skip`, `win`, `cascadeDestroy`, and `on` for any other event. Loops fade in and out; `destroy()` detaches and stops everything. `zvukPort(engine)` adapts a `@schmooky/zvuk` engine (sounds or variants by name, a missing name warns once) with no dependency on zvuk.
