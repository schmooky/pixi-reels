---
'pixi-reels': minor
---

Fix and sharpen shaped anticipation, following review of the feature above.

**Fix: a `curve` no longer scrolls a cascade reel.** A tumble reel has already
dropped its visible symbols and must tease at rest; the guard that pinned this
only covered the legacy tease, so a `curve` dragged buffer symbols back through
the empty window. `curve` / `cells` are now dropped in cascade mode with a
notice naming the reel.

**Fix: a travel anchor no longer deletes the legs before the last one.**
`cells` measured from the start of the tease, so a fast opening segment could
reach the target before the segments after it ever played — silently. The anchor
now applies to the final leg, which is what the docs always described.

**Fix: curve segments are validated at the call.** A negative `speed`, a
non-positive `duration`, a negative `hold` or a `NaN` were all accepted and
played. The function form is now resolved (and validated) for every teasing reel
when `setAnticipation` is called, so a bad curve throws next to the caller's own
stack instead of being swallowed by the reel task.

**Fix: drive bounds are profile-relative.** `motionModel('drive', { accelFrames:
20 })` means "reach the ACTIVE profile's full spin speed in 20 frames" and
re-resolves per spin. The absolute `accel` form only suited a single-profile
game: with `spinSpeed` 30 / 50 / 80 across the presets, one fixed bound made
SuperTurbo take 53 frames to reach speed where Normal took 20. Mixing the two
forms throws. A drive that cannot meet a segment's time budget now says so.

**Fix: `composeMasks` no longer accumulates scene nodes.** A member that owns
its own Graphics — including any strategy wrapped in `inset(...)` — added a
fresh child on every redraw, so each viewport resize and MultiWays reshape
leaked a node.

**Fix: the new mask warnings go through the notice channel**, so they carry a
code and obey `setLogLevel('silent')` like every other notice.

Add: `anticipation:segment` fires once per curve leg (`{ reelIndex, index,
total, speed, targetSpeed }`), so tease audio can hit the surge and the crawl
separately instead of polling the speed to find the boundary. `cells` takes the
same function-of-tease-order form as `curve`. `stepDrive` writes into the state
it is given rather than allocating one per reel per frame, and a parked drive is
no longer stepped at all.
