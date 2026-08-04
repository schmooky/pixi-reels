---
'pixi-reels': major
---

Change: `string[][]` is no longer accepted anywhere as a grid input. `runCascade`'s `nextGrid` must return `ColumnTarget[]`, and the `pixi-reels/testing` helper `spinAndLand` takes `ColumnTarget[]` too -- its `string[][]` convenience form is gone. Wrap with `grid.map((visible) => ({ visible }))`.

One accepted shape means a grid read out of the engine can be handed back to it without a conversion step, and a wrong shape now names itself at the call site instead of failing later inside the frame pipeline.
