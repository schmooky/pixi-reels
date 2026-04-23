---
"pixi-reels": minor
---

Add: `WinPresenter` + `Win = Payline | ClusterWin` for payline and cascade-cluster presentation, plus `win:*` events.

- `WinPresenter` cycles a mixed `Win[]` (paylines and/or clusters), dims non-winning symbols, drives a per-symbol animation (default `playWin()`, a named animation, or a custom callback), and renders an optional line for paylines.
- `Payline` — line-shaped hit (`line: (number | null)[]`, one row per reel).
- `ClusterWin` — arbitrary cell set (`cells: SymbolPosition[]`), for cascade pops, cluster-pay games, scatter splashes. No line is drawn; it's just "animate these cells".
- `LineRenderer` interface + default `GraphicsLineRenderer` (assetless polyline, draw-on tween, fade-out on clear). Called only for paylines.
- Events: `win:start` (mixed `Win[]`), `win:line` (paylines only), `win:cluster` (clusters only), `win:symbol` (both), `win:end`.
- Helpers: `paylineToCells`, `winToCells`, `isPayline`, `isCluster`, `sortByValueDesc`.
- Types: `Payline`, `ClusterWin`, `Win`, `SymbolPosition` (canonicalised to `config/types` and re-exported from events).
- Reels now have an explicit `container.zIndex = reelIndex` so the viewport's sorted `maskedContainer` draws reels deterministically — same order as before, but callers can now flip it for bottom-left diagonal overflow.

No existing API is changed or removed.
