---
"pixi-reels": patch
---

Fix: harden and complete the Hold & Win board public surface. `HoldAndWinState` (the pure reducer) is now exported from the barrel, so the documented "fork `HoldAndWinBoard` + `HoldAndWinState` and keep every import on public API" path actually resolves. `beginWave`/`respin` now throws on a duplicate hit targeting the same cell in one wave instead of silently dropping the first coin (a malformed result fails loud, matching `enter`'s duplicate-seed guard). A failed `playWin()` reaction to `coin:locked` is now logged via `console.warn` instead of being swallowed silently, and `setSymbolAt`'s JSDoc documents that it must not be called mid-wave.
