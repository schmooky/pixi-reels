---
"pixi-reels": major
---

1.0.0: drop legacy backwards compatibility, hide internal exports, document the public surface.

Breaking changes:
- Remove `ReelSetBuilder.visibleSymbols()`. Use `.visibleRows()`.
- Remove the legacy `string[][]` form from `setResult` and `initialFrame`. Use `ColumnTarget[]`.
- Remove negative-index slot mutation on result grids. Use `ColumnTarget.bufferAbove` and `bufferBelow`.
- Hide the following exports from the package entry: `OCCUPIED_SENTINEL`, `ReelSetInternalConfig`, `ResolvedReelGridConfig`, `OffsetCalculator`, `RandomSymbolProvider`, `SymbolFactory`, `StopSequencer`, `ReelMotion`.
- Rename internal-leaking methods on `Reel` and `ReelSet` to drop their leading underscore: `getAnchorRow`, `peekTargetShape`, `clearTargetShape`.
- Rename `ReelSet.skip()` to `ReelSet.skipSpin()` for symmetry with `skipNudge()`.
- Remove the unused `symbol:recycled` event from `ReelEvents`.

Fixes:
- Throw on concurrent `spin()`, `setResult()`, `pin()`, or `setShape()` calls while `nudge()` is in flight, instead of leaving the behavior undefined.

Docs:
- Rewrite the buffer-indexing guide and the affected API reference pages around the `ColumnTarget[]` form.
- Tighten recipe copy. Verify each recipe's listed APIs against its source.
- Regenerate llms.txt.
- Add a 1.0.0 migration page covering every breaking change with before and after snippets.
