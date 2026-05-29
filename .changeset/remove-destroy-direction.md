---
"pixi-reels": major
---

Remove the `direction` option from `DestroySymbolsOptions` and `ReelSymbol.playDestroy()`. The default destroy is now a pure "poof" — a brief anticipation pop then a fast scale-to-0 + alpha-to-0 implode (~200 ms total, no rotation). Subclasses overriding `playDestroy` should drop the `direction` parameter from their signature.
