---
'pixi-reels': minor
---

Add: `reelSet.setReelGroups([[0, 1], [2, 3], [4]])` — reels stop and skip as
blocks instead of individually.

Reel index was the engine's only ordering, which breaks as soon as a reel's job
is not tied to its neighbours. A filler reel meant to outlast a tease on the
reels before it landed in the middle of that tease instead, because its flat
`reelIndex * stopDelay` offset came due while they were still teasing, and a
skip press landed "everything outside the tease" — including that filler reel —
in one go.

A group is a barrier in both directions. **Stopping:** no reel in a group starts
its stop sequence (anticipation included) until every reel in the earlier groups
has landed, and a reel waiting its turn keeps spinning at full speed, so the
wait reads as "still going" rather than as a pause. **Skipping:** a press
releases the next un-landed group, with tease protection still applying inside
it — `protect: 'stepwise'` brings a group of teasing reels down one press at a
time, in tease order.

Stop delays become group-relative, so the profile's `stopDelay` staggers reels
within a group rather than re-adding a whole-board offset on top of the barrier.
An explicit `setStopDelays()` is still taken as given. Every reel must be listed
exactly once; `null` clears. Sticky across spins, like `setStopDelays()`.

Sets that never call it are unaffected.
