---
'pixi-reels': patch
---

Fix: `SpineSymbol` no longer clears every listener on its skeleton's animation state. It listened for its win on the state and called `state.clearListeners()` when the win completed, on `stopAnimation()` and on every recycle, dropping any listener a game or subclass had added, and, run inside spine's dispatch, making the listeners after it miss the event. It now listens on the win's own track entry and leaves the state's listeners alone (it still clears them when the symbol is destroyed, with its skeleton).

Fix: a `SpineSymbol.playWin()` promise settles when something else takes track 0 before the win completes (a subclass setting another animation, a second `playWin()`), instead of waiting forever. A second `playWin()` settles the first.
