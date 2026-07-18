---
"pixi-reels": minor
---

Add: `RunCascadeOptions.presentWinners`. a win-presentation hook awaited after detection and BEFORE `destroySymbols`, while the winners are still on the board. This is the natural seat for a `WinPresenter` pass (play the authored win clip, dim losers, then let the library destroy the cells): a round's presentation order is win → destroy → refill. `onCascade` keeps its post-destroy timing unchanged.
