---
"pixi-reels": minor
---

Add: `WinPresenter`, `LineRenderer` interface, default `GraphicsLineRenderer`, and `win:start` / `win:line` / `win:symbol` / `win:end` events for payline presentation.

- `WinPresenter` cycles a `Payline[]`, dims non-winning symbols, drives a per-symbol animation (default `playWin()`, a named animation, or a custom callback), and renders a line via a pluggable `LineRenderer`.
- `GraphicsLineRenderer` is the default: an assetless polyline through cell centres with a draw-on tween and fade-out on clear.
- `Payline` is exported from the root alongside helpers `paylineToCells` and `sortByValueDesc`.
- Reels now have an explicit `container.zIndex = reelIndex` so the viewport's sorted maskedContainer draws reels deterministically — same order as before, but callers can now flip it for bottom-left diagonal overflow.

No existing API is changed or removed.
