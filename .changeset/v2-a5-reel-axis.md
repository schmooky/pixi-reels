---
"pixi-reels": patch
---

Refactor: `Reel` routes its own position writes through the injected `ReelAxis` - container placement (cross marches reels, main carries the offset), `_placeSymbolView`, the unmasked re-sync (absolute cross, incremental main), and every reel-local conversion. Behavior is unchanged for the default vertical/forward axis. Internal; `ReelConfig` gains an optional `axis`.
