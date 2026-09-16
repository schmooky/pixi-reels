---
'pixi-reels': minor
---

Add: `reelSet.requestHurry(options?)` - a press that lands the reels it frees through their normal stop instead of placing them. Every press path (`skipSpin()`, `requestSkip()`, `slamStop()`) ends in a slam, which places the frame and lands in the same tick, so a press always read as a cut: the landing animation played on symbols already parked, and a tease was hidden rather than shortened. A game that wanted a pressed reel to spin out and bounce had to keep the press away from the engine and drive the live phase itself.

- Which reels a press frees is decided exactly as for `requestSkip()`: tease protection, `'stepwise'`, reel groups. Only what freeing means differs. A freed reel's tease ends and it returns to full speed, its stop runs with no delay, and the spin-out and bounce play; a reel hurried before it teased skips the tease. A hurried reel counts as released for the walk, so the next press moves on to the next group while it lands.
- Queues before `setResult()` like `requestSkip()`. No speed boost, no `wasSkipped`, `skipStage` untouched: a `requestSkip()` after it still slams whatever is still moving, so one button can hurry on the first press and cut on the second.
- `HurryOptions.speed` names a registered profile the hurried stop runs on (its `spinSpeed` for the spin-out, its bounce for the landing), for the common "a pressed reel lands on the turbo bounce" tuning. An unknown name throws. `reel.referenceSpeed` follows it, so `speedNormalized` keeps reading `1` at full speed.
- `hurry:requested` (`{ reels }`) reports the reels a press freed. `skip:requested` keeps meaning "about to be placed" and never lists a hurried reel; the landing arrives as the usual `spin:reelLanding` / `spin:reelLanded`.
- In cascade mode a tumble reel lands by placing its symbols, so there is nothing to spin out: the press slams as `requestSkip()` would and warns once with code `hurry-cascade`.

Add: `ReelPhase.hurry(speed?)` and the `onHurry()` hook - the phase-level verb underneath: reach the phase's natural end sooner without changing what it looks like, as opposed to `skip()`, which force-completes and may place. `StartPhase` and `AnticipationPhase` force-complete (their natural end is full speed), `SpinPhase` drops its floor, `StopPhase` cuts a scheduled delay and spins out at once. The default returns `false`, so a custom phase that does not implement it runs its course and the reel still lands; with `speed`, the phase carries on with that profile from there.
