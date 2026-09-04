---
"pixi-reels": minor
---

Add: `RoundedRectMaskStrategy` gains `scope: 'outer'` (one rect per reel, only the corners that sit on the set's bounding box rounded, safe at a zero cross gap) and a `corners` option (`{ topLeft, topRight, bottomLeft, bottomRight }`, screen-space) that limits which corners round in any scope. `HoldAndWinBuilder.cellMask` and the `BoardGrid` `mask` option now hand the factory `(cell, { cols, rows, corners })`, where `corners` are the board corners that cell sits on, so `(_, { corners }) => new RoundedRectMaskStrategy({ radius, corners })` clips a gapless board as one rounded window with a separate rect mask per cell. Zero-argument factories keep working.
