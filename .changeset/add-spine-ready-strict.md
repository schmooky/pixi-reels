---
"pixi-reels": minor
---

Add: `whenSpineReady()` resolves once the optional Spine import settles, so constructing `SpineSymbol`s on a cold start no longer throws a misleading "not installed" error before the dynamic import resolves (the constructor message now names that cause too). Adds an opt-in `SpineSymbolOptions.strict` that throws on an unmapped idle/win animation instead of silently showing nothing.
