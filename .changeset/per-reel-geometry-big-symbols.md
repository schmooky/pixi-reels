---
"pixi-reels": minor
---

Add: per-reel geometry, MultiWays, big symbols, and expanding wilds.

- **Per-reel static shape (pyramids):** `builder.visibleRowsPerReel([3, 5, 5, 5, 3])`, optional `reelPixelHeights`, `reelAnchor: 'top' | 'center' | 'bottom'`. Reels can now have non-uniform row counts at build time.
- **MultiWays (per-spin row variation):** `builder.multiways({ minRows, maxRows, reelPixelHeight })` plus `reelSet.setShape(rowsPerReel)` mid-spin. A new `AdjustPhase` (inserted only when `.multiways(...)` is called) reshapes reels between SPIN and STOP. Pin migration follows: pins gain a frozen `originRow` and migrate back toward it on each reshape.
- **Big symbols (`N×M` blocks):** `register('bonus', SymbolClass, { size: { w: 2, h: 2 } })`. The result grid stays `string[][]` — the engine paints OCCUPIED across the block. `getSymbolFootprint(col, row)` resolves any cell to the anchor.
- **Expanding wilds:** unchanged from the existing pin API; reaffirmed via tests as a degenerate big-symbol case.

New events: `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated`. They only fire on MultiWays slots — non-MultiWays event surfaces are unchanged.

New runtime: `reelSet.setShape()`, `reelSet.getSymbolFootprint()`, `reelSet.getVisibleGrid()`, `reelSet.isMultiWaysSlot`. New builder fluents: `.visibleRowsPerReel()`, `.reelPixelHeights()`, `.reelAnchor()`, `.multiways()`, `.pinMigrationDuration()`, `.pinMigrationEase()`. Pin gains optional `originRow`.

AdjustPhase animates the reshape: every visible symbol tweens its height + Y from the old shape to the new one over `pinMigrationDuration` ms with the configurable `pinMigrationEase`. Pin overlays tween in lock-step so a sticky wild visibly slides to its migrated row. Set `pinMigrationDuration(0)` for an instant snap.

Constraints: big symbols and MultiWays are mutually exclusive per slot in v1. Cascade mode + MultiWays throws at build.

**Breaking** (debug-only, not protected by semver but called out): `DebugSnapshot.visibleRows` widens from `number` to `number[]` so jagged shapes are representable. Adapt downstream code that deep-reads the snapshot.
