---
"pixi-reels": patch
---

Fix: stop reparenting recycled symbols on spotlight hide and always anchor `Reel._replaceSymbol` to its own container.

Two related bugs caused symbols to render in the wrong reel after rapid spin/skip cycles, particularly when the win spotlight runs alongside an expanding-wild mechanic that triggers many `placeSymbols` calls in quick succession:

- `SymbolSpotlight.hide()` reparented every symbol it had ever tracked back to its `originalParent`, even when `promoteAboveMask: false` (no reparenting on `show()`) or after the shared symbol pool had recycled the instance into a different reel. The recycled symbol got yanked from its new owner, leaving a hole there and a stranger in the original reel.
- `Reel._replaceSymbol` used the captured `oldSymbol.view.parent` as the destination for the replacement view. If the old symbol had been moved (by the spotlight or by pool recycling), the new symbol landed in a foreign container — symbols accumulated in the wrong reel across spins.

Both paths now anchor to the reel's own container; the spotlight only reparents symbols whose view is still in `spotlightContainer` (i.e., never recycled away).
