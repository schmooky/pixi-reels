---
'pixi-reels': minor
---

Add: `ReelSet.getTargets(): ColumnTarget[]` and `Reel.getTarget()`. The whole board as the same shape `setResult` takes -- buffers included, big-symbol anchors at their true positions -- so `reelSet.setResult(reelSet.getTargets())` reproduces what is on screen.

`getVisibleGrid()` is unchanged and still returns `string[][]`. It reports the visible window only, so it cannot be replayed: a block anchored in `bufferStart` with just its tail showing reads as that id at visible cell 0, and feeding that back re-anchors the block there. Use `getVisibleGrid()` to read the board for win logic, and `getTargets()` to capture and replay one.
