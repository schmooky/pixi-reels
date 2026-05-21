---
'pixi-reels': minor
---

Add: `ReelSet.nudge(col, options)` — shift a single reel by N positions after it has landed, revealing caller-supplied `incoming` symbols. The classic UK fruit-machine nudge. Emits `nudge:start` / `nudge:complete` / `nudge:cancelled` on the reel-set bus and `phase:enter('nudge')` / `phase:exit('nudge')` per-reel. Multi-reel sync via `Promise.all([...])`; staggered waves via `NudgeOptions.startDelay`; abort with `NudgeOptions.signal` (`AbortSignal`); skip in-flight tweens with `ReelSet.skipNudge(col)`. Big-symbol blocks on the target reel are nudged through as a unit when the rotation preserves the block (cross-reel `w > 1` blocks still throw). Also fixes `ReelMotion._wrapTopToBottom` to use a symmetric `<= minY` boundary check (previously strict `< minY`, so an upward shift that landed exactly on the threshold no-op'd silently — exposed by `nudge` since standard spinning only moves downward).
