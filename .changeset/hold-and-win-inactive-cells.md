---
"pixi-reels": minor
---

Add: dormant Hold & Win cells for boards that grow mid-feature. `HoldAndWinBuilder.inactive(cells, id?)` builds the cells but keeps them out of the feature - they never spin, take no coin, show `id` (default: the empty id) and do not count toward `capacity` / `isFull` - until `HoldAndWinBoard.activate(cells)` wakes them, which fires the new `cells:activated` event. `reset()` puts them back to dormant. `HoldAndWinState` takes the inactive set as a third constructor argument and gains `activate`, `inactiveCells` and `isActive`; the board mirrors them as `activate`, `inactiveCells`.
