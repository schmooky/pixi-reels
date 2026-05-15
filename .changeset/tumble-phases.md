---
"pixi-reels": minor
---

Replace `.cascade()` with `.tumble()` and split cascade-drop into three independently overridable phases.

Breaking changes: `.cascade(DropRecipes...)` is removed. `DropRecipes`, `DropStartPhase`, `DropStopPhase`, `CascadeAnticipationPhase`, and their `*Config` types no longer export from `pixi-reels`. Use `.tumble({ fall, dropIn })` on the builder and override individual phases via `.phases(f => f.register('cascade:fall'|'cascade:place'|'cascade:dropIn', MyPhase))`.

New: `reelSet.refill({ winners, grid })` for Moment B cascade refills. Gravity-correct geometry — untouched survivors stay, survivors above a hole slide down, new symbols enter from above into the top `winners.length` rows. Per-symbol `cascade:fall:symbol` / `cascade:dropIn:symbol` events fire right before each tween so listeners can run parallel tweens on any view property in sync with the library's motion. Per-reel boundary events: `cascade:fall:start` / `cascade:fall:end` / `cascade:place:done` / `cascade:dropIn:start` / `cascade:dropIn:end`.

See `docs/recipes/tumble-cascade.md` for the full recipe (drop-on-click, server wait with spinner, cascading multiplier).
