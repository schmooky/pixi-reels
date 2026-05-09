---
'pixi-reels': patch
---

Fix: `SpineReelSymbol` one-shot animation promises (`playWin` / `playLanding` / `playOut`) no longer dangle when the track is hijacked.

Three previously-leaking scenarios now settle the returned promise instead of hanging forever:

- **Concurrent one-shots** — calling `playOut()` while `playWin()` is in flight resolves the prior `playWin` promise (its track was overwritten) before starting the new one.
- **`playBlur` mid-animation** — entering a SPIN that triggers blur while a win is still animating settles the win promise.
- **Listener leak** — back-to-back one-shots no longer accumulate stale listeners on the Spine state. Each new one-shot detaches the prior listener.

Refactored to a single internal `_resolveOneShot()` helper called from `onActivate`, `onDeactivate`, `stopAnimation`, `playBlur`, and the start of every new `_playOneShot`. The track-entry guard (`done !== entry`) is preserved so unrelated entries firing complete on the same track are correctly ignored.

This unblocks reliable `await symbol.playWin()` patterns in win presenters and cascade orchestration.
