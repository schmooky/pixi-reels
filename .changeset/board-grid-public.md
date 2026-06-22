---
"pixi-reels": minor
---

Add: `BoardGrid` — the generic "board of reels" primitive is now a public export. A grid of cells that each spin independently (`cells`, `spinCells`, `symbolAt`/`reelAt`, `cellBounds`/`cellCenter`, `setProfile`, `place`), with no game rules of its own. `HoldAndWinBoard` is one opinionated board built on it; build your own the same way. `spinCells`' per-cell `onLanded` callback may be async — return a promise and `spinCells` resolves only once every cell has landed and its after-land work has finished.
