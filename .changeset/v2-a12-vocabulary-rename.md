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
