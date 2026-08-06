---
'pixi-reels': patch
---

Fix: an `unmask: true` symbol in a BUFFER cell no longer renders above the mask, where it hung outside the grid in plain sight.

`unmask` lifts a view out of the reel's masked container. That is an at-rest presentation for a cell the player is looking at, and `notifyLanded()` has always lifted visible cells only. But the lift decision itself was made from the symbol id alone, so any at-rest write to a buffer slot lifted it as well. and a buffer slot is parked outside the window precisely because the mask should hide it.

The path that showed it in a real game was a skip. `StopPhase.onSkip` lands the full strip (buffers included) through `placeStrip`, so a skip taken once the bounce has started. i.e. after `notifyLanded()` put the reel back at rest. lifted every unmask symbol the target frame had in `bufferStart` / `bufferEnd`, and they stayed up there until the next spin pulled them back down. `Reel.reshape` growing a strip at rest did the same to its new tail cells.

The lift now takes the slot into account, so a buffer cell never lifts. A second case needed the reverse: a symbol lifted while it was VISIBLE can still travel into a buffer slot without being replaced. a nudge rotates the array and only the wrapped symbol goes through `_replaceSymbol`, so an unmask symbol nudged out of the window kept its seat above the mask. Every settle now re-masks any lifted view that ended up outside the window.
