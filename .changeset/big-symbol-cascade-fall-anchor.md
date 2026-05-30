---
"pixi-reels": patch
---

Fix: buffer-anchored big symbols no longer render empty, and big-symbol blocks no longer jitter, when falling through a tumble cascade. `CascadePlacePhase` now preserves `bufferAbove` target cells, so a "tail-visible" block (anchor above the viewport) keeps its anchor through the animated place path instead of being overwritten with a random symbol and leaving its visible cell empty. The place and drop-in phases now animate each block anchor exactly once instead of once per occupied visible row — previously the duplicate drop tweens fought over the anchor's position (the jitter) and could land it a row off target.
