---
'pixi-reels': major
---

Rename: the row/column vocabulary becomes orientation-neutral. A reel's strip is made of **cells**, and the off-window slots either side are **start** and **end** (start = the smaller main coordinate: above for vertical, left for horizontal), independent of which way the reel travels.

Run `npx pixi-reels-codemod v1-to-v2` over your sources. `build()` throws a named error if it still sees a v1 key.

Core geometry:

| v1 | v2 |
|---|---|
| `visibleRows`, `visibleRowsPerReel` | `visibleCells`, `visibleCellsPerReel` |
| `bufferSymbols({ above, below })` | `bufferSymbols({ start, end })` |
| `ColumnTarget.bufferAbove` / `.bufferBelow` | `.bufferStart` / `.bufferEnd` |
| `Reel.bufferAbove` / `.bufferBelow` | `.bufferStart` / `.bufferEnd` |
| `reelPixelHeights` | `reelExtents` |
| `Reel.spinSymbolHeight` | `Reel.spinCellSize` |

Motion:

| v1 | v2 |
|---|---|
| `ReelMotion.displace(deltaY)` | `.advance(travelDelta)` |
| `ReelMotion.slotHeight` | `.slotPitch` |
| `ReelMotion.getRowY(row)` | `.getCellMain(cell)` |

Grid coordinates and payloads:

| v1 | v2 |
|---|---|
| `SymbolPosition.rowIndex` | `.cellIndex` |
| `cascade:*` `winnerRows`, `offsetRows` | `winnerCells`, `offsetCells` |
| `DropOffset.originalRow` | `.originalCell` |
| `TumbleConfig.rowStagger` / `.rowOrder` | `.cellStagger` / `.cellOrder` |
| `rowOrder: 'bottomToTop' \| 'topToBottom'` | `cellOrder: 'endFirst' \| 'startFirst'` |
| `pin:migrated { fromRow, toRow }` | `{ fromCell, toCell }` |
| `CellPin.originRow` | `.originCell` |

Offsets:

| v1 | v2 |
|---|---|
| `OffsetXMode` | `CrossOffsetMode` |
| `TrapezoidConfig.topWidthFactor` / `.bottomWidthFactor` | `.startFactor` / `.endFactor` |

Semantics, not just names:

| v1 | v2 |
|---|---|
| `bufferSymbols({ above, below })` | `bufferSymbols({ start, end })` |
| `reelAnchor: 'top' \| 'center' \| 'bottom'` | `'start' \| 'center' \| 'end'` |
| `SymbolData.size { w, h }` | `{ reels, cells }` (and `getSymbolFootprint`'s `size`) |
| `NudgeOptions.direction: 'up' \| 'down'` | `'forward' \| 'reverse'`, relative to the reel's own axis |
| `'symbol:created': [symbolId, row]` | `[symbolId, stripIndex]` -- it was always the strip index, never a visible row |

`nudge()` is now genuinely direction-relative: which edge feeds the reel is derived from the axis polarity, so a reel built with `direction('reverse')` nudges upward on `'forward'`. A vertical/forward reel behaves exactly as `'down'` did.

New:

- `builder.cellStacking(order)` / `builder.reelStacking(order)` expose render order explicitly (`'ascending'` default = today's behaviour: the cell/reel at the larger coordinate draws in front). Deliberately geometric -- `direction('reverse')` does NOT flip stacking, so art lit from above keeps overlapping the way it was drawn.
- `SymbolPosition.setId?` for games composing more than one reel set. The engine never reads it.
- `build()` throws when a cross-reel big symbol (`size.reels > 1`) meets a mixed `directionPerReel([...])`. The coordinator assumes one shared feed edge across the reels a block covers.
- `ReelMotion`'s wrap callback drops its dead `arrayIndex` / `direction` arguments.

Fail-loud, no silent aliases: `visibleRows()`, `visibleRowsPerReel()` and `reelPixelHeights()` are gone but still present as throwing stubs, and every renamed option key or string value throws from the builder method that received it (`bufferSymbols({ above })`, `multiways({ minRows })`, `symbolData({ size: { w } })`, `tumble({ fall: { rowStagger } })`, `offsetConfig({ topWidthFactor })`, `reelAnchor('top')`, `initialFrame`/`setResult` columns with `bufferAbove`). Each message names the v2 replacement and the codemod. The table itself is exported as `V1_BUILDER_METHODS` / `V1_OPTION_KEYS` / `V1_OPTION_VALUES`.

Codemod: `npx pixi-reels-codemod v1-to-v2 src` rewrites the API surface (AST-based, so it never touches your own `row` / `col` locals or your comments). Verified end-to-end against this repo's 112 site recipes at their pre-rename revision: zero v1 API names left in code.

Docs: a new "Migrating to 2.0" guide covers every rename with a before/after, including the three things the codemod deliberately leaves alone. ADRs, CHANGELOGs and the 1.0 migration guide keep their v1 vocabulary. they are records of what was true then.
