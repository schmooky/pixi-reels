---
"pixi-reels": minor
---

Add: Hold & Win board. `HoldAndWinBuilder` builds a `HoldAndWinBoard` — a grid of independently spinning 1×1 cells with the full respin / lock / collect lifecycle (`enter`, `respin`, `release`, `setSymbolAt`, `skip`, `reset`), typed events (`coin:locked`, `board:full`, `feature:end`, …), per-cell geometry (`cellBounds`/`cellCenter`) and live symbol access (`symbolAt`/`reelAt`). Coins are opaque `{ cell, id, data }`, so value, multipliers, collectors and flights stay game-layer. Also exports `EmptySymbol` (a render-nothing symbol).
