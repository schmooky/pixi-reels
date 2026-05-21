---
'pixi-reels': minor
---

Add: `ReelSet.nudge(col, options)` — shift a single reel by N positions after it has landed, revealing caller-supplied `incoming` symbols. The classic UK fruit-machine nudge.

API surface includes:

- `NudgeOptions.distance` / `.direction` / `.incoming` — required; `incoming` is top-down by FINAL on-strip position (overflow lands in the matching off-screen buffer).
- `NudgeOptions.duration` / `.ease` — default `'power2.out'`; overshooting eases are clamped so wraps never fire past the landing position.
- `NudgeOptions.startDelay` — defer the tween for staggered `Promise.all` waves.
- `NudgeOptions.signal: AbortSignal` — cancel mid-tween; strip still snaps to landed; promise rejects with `AbortError` and `nudge:cancelled` fires.
- `ReelSet.skipNudge(col?)` / `Reel.skipNudge()` — fast-forward an in-flight tween; `nudge()` resolves normally.
- Events: `nudge:start` (after pre-placement), `nudge:complete`, `nudge:cancelled` on the reel-set bus; `phase:enter('nudge')` / `phase:exit('nudge')` per-reel.

Big-symbol blocks on the target reel are nudged through as a unit when the rotation preserves the block:
- down: `anchor + h - 1 + distance < total` (block may extend into bufferBelow)
- up: `anchor - distance >= bufferAbove` (anchor must land in visible — engine doesn't render bufferAbove anchors today)

Cross-reel blocks (`w > 1`) throw — splitting an anchor from its other-reel cells isn't safe under a single-reel nudge.

Also fixes `ReelMotion._wrapTopToBottom` to use a symmetric `<= minY` boundary check (previously strict `< minY`, so an upward shift that landed exactly on the threshold no-op'd silently — exposed by `nudge` since standard spinning only moves downward).
