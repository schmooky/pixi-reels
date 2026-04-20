# Mechanics roadmap

A living catalogue of slot mechanics and reel-motion approaches, scored
against what `pixi-reels` ships today. Each non-shipping row has a matching
GitHub issue; epics, stories, and tasks are linked at the end.

Legend:
- **Status**: [done] ships - [partial] partial (recipe exists / workaround) - [todo] not yet
- **Bucket**: what release a gap would land in - `recipe` (no lib change),
  `minor` (additive lib change), `major` (breaking)
- **Priority**: `p0` next release, `p1` soon, `p2` nice, `p3` later

Epics drive major work; stories are single-release features; tasks are
self-contained (usually a recipe + MDX page).

---

## Layer 1 - Reel motion & board structure (engine-level)

| Mechanic | Status | Bucket | Priority | Notes |
|---|---|---|---|---|
| Vertical scroll spin (StandardMode) | [done] | - | - | Core. |
| Cascade / tumble (CascadeMode) | [done] | - | - | Core + CascadeMode + example. |
| Immediate mode (no motion) | [done] | - | - | `ImmediateMode`. |
| Anticipation phase | [done] | - | - | `AnticipationPhase`. |
| Mixed direction per reel (up vs down) | [todo] | minor | p3 | Per-reel direction flag. |
| Drop-in (symbols fall from above, no scroll strip) | [todo] | minor | p2 | New `SpinningMode`. |
| Roll-up (symbols rise from below) | [todo] | minor | p3 | New `SpinningMode`. |
| Expanding reels at runtime (add rows) | [todo] | minor | p3 | Reel must support live resize. |
| Split symbols (two symbols per cell) | [todo] | minor | p2 | Cell-fraction occupancy. |
| Horizontal reels | [todo] | **major** | p2 | Orientation is hardcoded to vertical. |
| Megaways (variable `visibleRows` per reel) | [todo] | **major** | p1 | Frame/geometry rewrite. |
| Cluster grid (WxH, no reel concept) | [todo] | **major** | p1 | New non-reel mode + viewport. |
| Colossal / big symbols (2x2, 3x3 overlay) | [todo] | **major** | p1 | Multi-cell symbol occupancy. |
| Infinity Reels (dynamic column count) | [todo] | **major** | p3 | Columns added on each win. |
| Horizontal-expand (add columns mid-spin) | [todo] | **major** | p3 | Related to Infinity Reels. |

## Layer 2 - Symbol mechanics (mostly recipes)

| Mechanic | Status | Bucket | Priority | Notes |
|---|---|---|---|---|
| Standard wild / scatter | [done] | - | - | Register and go. |
| Sticky wild | [done] | - | - | Recipe + component. |
| Walking wild | [done] | - | - | Recipe + component. |
| Single-reel respin | [done] | - | - | Recipe (uses 1-reel ReelSets). |
| Hold & Win | [done] | - | - | Example + starter recipe. |
| Stacked full-column symbol | [todo] | recipe | p1 | Feed a single symbol 3x in the column. |
| Expanding wild (grows to full reel) | [todo] | recipe | p1 | On-land animation + column fill. |
| Multiplier wild (number overlay) | [todo] | recipe | p1 | Custom `ReelSymbol` with number sprite. |
| Mystery symbol (reveal to matching) | [todo] | recipe | p1 | `setResult` + delayed `placeSymbols`. |
| Mystery stacks (stacked mystery reveal) | [todo] | recipe | p2 | Combine stacked + mystery. |
| Symbol upgrade / morph | [todo] | recipe | p2 | Post-win symbol-class promotion. |
| Nudge (shift a reel by N rows) | [todo] | recipe | p2 | May need `reel.nudge(n)` API. |
| Chain-reaction wilds | [todo] | recipe | p2 | Win spawns a wild; cascade triggers chain. |
| Portal / symbol teleport | [todo] | recipe | p3 | Swap two cells with motion. |
| Reel modifiers pre-spin (random wilds, locked reels) | [todo] | recipe | p2 | FrameBuilder middleware demo. |
| Reel clone / mirror outcome | [todo] | recipe | p3 | Two reels end with identical columns. |
| Sticky multiplier ladder | [todo] | recipe | p2 | Position-locked multipliers that persist. |

## Layer 3 - Win feedback & presentation (recipes)

| Mechanic | Status | Bucket | Priority | Notes |
|---|---|---|---|---|
| Symbol spotlight (win highlight) | [done] | - | - | `SymbolSpotlight`. |
| Near-miss / anticipation visual | [done] | - | - | Via `AnticipationPhase`. |
| Payline visualization | [todo] | recipe | p0 | Draw line across winning cells. |
| Ways-to-win highlighting | [todo] | recipe | p1 | Per-column fade for winning cells. |
| Cluster connection lines | [todo] | recipe | p1 | Connected cluster -> animated links. |
| Big-win celebration (zoom + scale) | [todo] | recipe | p1 | Tiered reveal (win / mega / super). |
| Coin collect / aggregated value | [todo] | recipe | p2 | Collect bonus coins into a counter. |
| Multiplier meter accumulator | [todo] | recipe | p2 | Increments per cascade; resets on non-win. |
| Pay Both Ways | [todo] | recipe | p3 | Left->right + right->left evaluation demo. |

## Recipe / site infrastructure (UX of the docs)

| Item | Status | Bucket | Priority | Notes |
|---|---|---|---|---|
| Single spin button with slam-stop on re-click | [todo] | recipe | p0 | One button, second click calls `skip()`. |
| Remove "Live recipe" footer text | [todo] | recipe | p0 | Chrome cleanup. |
| "Open in Sandbox" button on each recipe | [todo] | recipe | p1 | Deep-link from recipe -> sandbox with recipe pre-loaded. |

## Out of scope (game-logic, not engine)

Not tracked as issues: free spins counter, buy-feature button, bonus-pick
games, jackpot wheels, pay-tables, bet management. These belong in a game
integration on top of `pixi-reels`, not in the library.

---

## Planning conventions

- **Epics** (type/epic) map to the four Layer 1 `major` rows. Each epic
  links its child stories via a task list in the issue body.
- **Stories** (type/story) are the Layer 1 `minor` rows and any story-sized
  library work discovered under epics.
- **Tasks** (type/task) are Layer 2 and Layer 3 recipe rows, plus the
  recipe-infra rows above.
- **Labels per issue**: `mechanic`, exactly one of `type/*`, one of
  `priority/*`, one of `release/*`, one of `size/*`, plus any applicable
  `area/*`.
- **Estimates** are T-shirt sizes; no story points.
- **GitHub Project v2**: "Mechanics backlog" (create once, bulk-add all
  issues tagged `mechanic`).
