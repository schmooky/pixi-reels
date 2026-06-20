---
"pixi-reels": patch
---

Fix: harden `HoldAndWinBoard` against driver errors and mid-wave misuse. `respin()` now restores the reducer's phase if the underlying spin throws (e.g. an unregistered hit `id`), so a failed wave no longer strands the board in `spinning` where every later `respin()` would throw "wave in flight" — the error still propagates to the caller. `release()` and `setSymbolAt()` now throw if called while a wave is in flight instead of silently corrupting the locked-coin ledger mid-spin.
