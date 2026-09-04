---
"pixi-reels": patch
---

Perf: `SpineReelSymbol` takes its cached, hidden Spine instances off the ticker. It keeps one instance per symbol id for instant swaps, and each of those was created with spine-pixi's default `autoUpdate`, so every parked skeleton kept updating its animation state and world transform every frame while invisible - hundreds of them on a Hold & Win board of 1x1 reels. Now only the instance on screen updates; a parked one is resumed the moment it is shown again.
