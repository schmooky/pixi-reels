---
"pixi-reels": minor
---

Add: `orientation('horizontal')` for uniform grids. A single horizontal reel is the banner - cells march along X, the strip travels on X, and it spins and lands through the same lifecycle as a vertical set. The builder projects viewport extents, cross-marching pitch and mask rects through the set axis, `Reel` derives its motion cell size / cross pitch from the axis (symbol art still sizes to screen width x height), and `ReelSet.getCellBounds` projects to screen. Pyramid / MultiWays horizontal fail loud for now.
