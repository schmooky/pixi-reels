---
"pixi-reels": patch
---

Fix: harden `HoldAndWinBoard` recovery and mid-wave misuse. If `respin()` throws between starting and closing a wave — most plausibly a game-layer `respin:start` / `cell:landed` / `coin:locked` listener throwing — it now restores the reducer's phase and slams any still-spinning cells before rethrowing, so a failed wave no longer strands the board in `spinning` (where every later `respin()` threw "wave in flight") or leaves an orphaned reel (where the next `respin()` threw "already spinning"). The error still propagates to the caller. The reducer also ignores stray landings outside a wave, so a cell settling after a `reset()` or a recovered error can no longer re-lock a coin into a cleared ledger or flip a finished feature back to active. `release()` and `setSymbolAt()` still throw if called while a wave is in flight.
