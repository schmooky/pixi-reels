# pixi-reels

## 1.1.0

### Minor Changes

- [#158](https://github.com/schmooky/pixi-reels/pull/158) [`22f2b33`](https://github.com/schmooky/pixi-reels/commit/22f2b339a8b2f285a08678c080aaa854e988fde0) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `BoardGrid` — the generic "board of reels" primitive is now a public export. A grid of cells that each spin independently (`cells`, `spinCells`, `symbolAt`/`reelAt`, `cellBounds`/`cellCenter`, `setProfile`, `place`), with no game rules of its own. `HoldAndWinBoard` is one opinionated board built on it; build your own the same way. `spinCells`' per-cell `onLanded` callback may be async — return a promise and `spinCells` resolves only once every cell has landed and its after-land work has finished.

- [#158](https://github.com/schmooky/pixi-reels/pull/158) [`22f2b33`](https://github.com/schmooky/pixi-reels/commit/22f2b339a8b2f285a08678c080aaa854e988fde0) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: Hold & Win board. `HoldAndWinBuilder` builds a `HoldAndWinBoard` — a grid of independently spinning 1×1 cells with the full respin / lock / collect lifecycle (`enter`, `respin`, `release`, `setSymbolAt`, `skip`, `reset`), typed events (`coin:locked`, `board:full`, `feature:end`, …), per-cell geometry (`cellBounds`/`cellCenter`) and live symbol access (`symbolAt`/`reelAt`). Coins are opaque `{ cell, id, data }`, so value, multipliers, collectors and flights stay game-layer. Also exports `EmptySymbol` (a render-nothing symbol), plus `cellKey` and the `HwEffect` type so you can fork `HoldAndWinBoard` + `HoldAndWinState` and keep every import on public API.

### Patch Changes

- [#158](https://github.com/schmooky/pixi-reels/pull/158) [`22f2b33`](https://github.com/schmooky/pixi-reels/commit/22f2b339a8b2f285a08678c080aaa854e988fde0) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: harden and complete the Hold & Win board public surface. `HoldAndWinState` (the pure reducer) is now exported from the barrel, so the documented "fork `HoldAndWinBoard` + `HoldAndWinState` and keep every import on public API" path actually resolves. `beginWave`/`respin` now throws on a duplicate hit targeting the same cell in one wave instead of silently dropping the first coin (a malformed result fails loud, matching `enter`'s duplicate-seed guard). A failed `playWin()` reaction to `coin:locked` is now logged via `console.warn` instead of being swallowed silently, and `setSymbolAt`'s JSDoc documents that it must not be called mid-wave.

- [#158](https://github.com/schmooky/pixi-reels/pull/158) [`22f2b33`](https://github.com/schmooky/pixi-reels/commit/22f2b339a8b2f285a08678c080aaa854e988fde0) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: harden `HoldAndWinBoard` recovery and mid-wave misuse. If `respin()` throws between starting and closing a wave — most plausibly a game-layer `respin:start` / `cell:landed` / `coin:locked` listener throwing — it now restores the reducer's phase and slams any still-spinning cells before rethrowing, so a failed wave no longer strands the board in `spinning` (where every later `respin()` threw "wave in flight") or leaves an orphaned reel (where the next `respin()` threw "already spinning"). The error still propagates to the caller. The reducer also ignores stray landings outside a wave, so a cell settling after a `reset()` or a recovered error can no longer re-lock a coin into a cleared ledger or flip a finished feature back to active. `release()` and `setSymbolAt()` still throw if called while a wave is in flight. `respin()` now returns a caller-owned `hits` array (a copy of the wave's landings) rather than a live reference into reducer state, so mutating the result can't reach back into the board.

## 1.0.1

### Patch Changes

- [#150](https://github.com/schmooky/pixi-reels/pull/150) [`6a96d60`](https://github.com/schmooky/pixi-reels/commit/6a96d603cbc8b9f1b80176268850ad9157177c26) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: buffer-anchored big symbols no longer render empty, and big-symbol blocks no longer jitter, when falling through a tumble cascade. `CascadePlacePhase` now preserves `bufferAbove` target cells, so a "tail-visible" block (anchor above the viewport) keeps its anchor through the animated place path instead of being overwritten with a random symbol and leaving its visible cell empty. The place and drop-in phases now animate each block anchor exactly once instead of once per occupied visible row — previously the duplicate drop tweens fought over the anchor's position (the jitter) and could land it a row off target.

## 1.0.0

### Major Changes

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Hide internal exports from the package entry: `OCCUPIED_SENTINEL`, `ReelSetInternalConfig`, `ResolvedReelGridConfig`, `OffsetCalculator`, `RandomSymbolProvider`, `SymbolFactory`, `StopSequencer`, and `ReelMotion`.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Hide `SpinController`, `SpinControllerHooks`, and the built-in phase classes (`StartPhase`, `SpinPhase`, `StopPhase`, `AnticipationPhase`, `AdjustPhase`, `CascadeFallPhase`, `CascadePlacePhase`, `CascadeDropInPhase`) from the package entry — they are internal wiring. Register custom phases by extending `ReelPhase` and calling `builder.phases(f => f.register(...))`. Phase config TYPES (`StartPhaseConfig`, etc.) remain exported.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove the `direction` option from `DestroySymbolsOptions` and `ReelSymbol.playDestroy()`. The default destroy is now a pure "poof" — a brief anticipation pop then a fast scale-to-0 + alpha-to-0 implode (~200 ms total, no rotation). Subclasses overriding `playDestroy` should drop the `direction` parameter from their signature.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove the legacy `string[][]` form from `setResult` and `initialFrame`. Use the `ColumnTarget[]` shape, which survives `structuredClone` / JSON / `postMessage`.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove negative-index slot mutation on result grids. Use `ColumnTarget.bufferAbove` and `ColumnTarget.bufferBelow` to target buffer cells.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove the unused `symbol:recycled` event from `ReelEvents`.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove `ReelSetBuilder.visibleSymbols()`. Use `.visibleRows()` instead.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Rename internal-leaking methods on `Reel` / `ReelSet` to drop their leading underscore: `getAnchorRow`, `peekTargetShape`, `clearTargetShape`.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Rename `ReelSet.skip()` to `ReelSet.skipSpin()` for symmetry with `skipNudge()`.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Enable `stripInternal` in tsconfig: methods marked `@internal` are removed from the published `.d.ts` (`Reel.reshape`, `Reel.setStopFrame`, `Reel.setCrossReelResolver`, `Reel.getAnchorRow`, `Reel.notifySpinStart`, `Reel.notifySpinEnd`, `Reel.notifyLanded`, `Reel.snapToGrid`). The runtime methods still exist; only the type declarations are removed.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Move the headless testing harness to a dedicated subpath: `import { createTestReelSet, FakeTicker, HeadlessSymbol, spinAndLand, captureEvents, expectGrid, countSymbol } from 'pixi-reels/testing'`. It is no longer re-exported from `pixi-reels`, so production bundles never pull it in.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Replace the inline-options-object signature of `ReelSet.refill()` with a typed `RefillOptions` interface and a `RefillResult` return type that mirrors `RunCascadeResult`. Adds `signal: AbortSignal` for mid-refill cancellation. The result now exposes `winnersRefilled`, `finalGrid`, `wasSkipped`, and `duration` (previously the misnamed `SpinResult` shape).

### Minor Changes

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `driveGsapWithTicker(ticker)` helper that pins GSAP to the PixiJS ticker (and returns a disposer that restores GSAP's own ticker). Encapsulates the one-line incantation every integration had to remember, so engine animations don't freeze in hidden tabs / iframes.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: injectable `rng` on `ReelSetBuilder` (and `RandomSymbolProvider`), defaulting to `Math.random`. Regulated / provably-fair deployments can now inject a seeded, audited PRNG so the on-screen scrolling strip is reproducible from a seed for dispute resolution and frame-level regression.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: the symbol recycle pool now auto-sizes its per-id capacity to the whole strip (every visible + buffer cell, floored at 20), eliminating destroy/recreate churn on large and MultiWays grids. A new `ReelSetBuilder.poolCapacity(n)` override is available for memory-constrained or unusually swap-heavy deployments.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `SpinOptions.signal` (AbortSignal) and `SpinOptions.timeoutMs` (watchdog). A spin whose result never arrives can no longer hang forever — aborting the signal or exceeding the timeout rejects the `spin()` promise and force-stops the reels to a clean grid. `signal` rejects with `signal.reason` when it is an `Error`, so a failed/cancelled fetch propagates directly.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `whenSpineReady()` resolves once the optional Spine import settles, so constructing `SpineSymbol`s on a cold start no longer throws a misleading "not installed" error before the dynamic import resolves (the constructor message now names that cause too). Adds an opt-in `SpineSymbolOptions.strict` that throws on an unmapped idle/win animation instead of silently showing nothing.

### Patch Changes

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `enableDebug(reelSet, key?)` now registers each reel set under a per-instance key on `window.__PIXI_REELS_DEBUG_INSTANCES` instead of letting multiple reel sets clobber the single `window.__PIXI_REELS_DEBUG` global (which still points at the most recently enabled instance for convenience).

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `EventEmitter` no longer drops a persistent `on()` listener when the same handler reference is also registered via `once()`. `emit` now removes the fired `once` entry by identity instead of by `(fn, context)`, which previously deleted every listener sharing that function reference.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `StandardMode.computeDeltaY` now clamps displacement symmetrically (±half a symbol). The upward step-back in `StartPhase` (and large frame deltas) previously moved more than one slot per tick, skipping `ReelMotion`'s single-wrap-per-call invariant and desyncing the symbol array from the view. `Reel.update` also clamps pathological `deltaMs` spikes (backgrounded-tab refocus, non-Pixi tickers).

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the "nudge in flight" guard that blocks `spin()` / `setResult()` / `pin()` is now reference-counted. With parallel nudges across reels, the first to settle no longer clears the guard early and lets a later call race a still-live nudge (which could tear a frame or desync a pin).

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `ObjectPool` now guards against double-release (the same instance was pooled twice and then handed to two cells, silently aliasing one symbol) and against use after `destroy()` (`acquire` throws, `release` no-ops) so a late ticker/promise callback can't resurrect or leak the pool.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: pin migration on a MultiWays reshape now resolves cell collisions deterministically. When two pins clamp onto the same row, the topmost keeps the cell and the other is expired (with `pin:expired` reason `'collision'`) and its overlay released — previously the second silently overwrote the first in the pin map and orphaned an overlay. Pin-overlay Y is also computed through a single helper so placement agrees across reshape.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `Reel.destroy()` now emits `'destroyed'` before `removeAllListeners()` (so listeners actually receive it) and destroys each symbol's view instead of releasing live symbols back into the shared pool and then destroying their views out from under it (which handed a destroyed view to the next `acquire()`).

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `setResult` / `initialFrame` buffer-count validation now measures the highest defined index, not raw array length. A sparse `bufferAbove: ['X', undefined, undefined]` (common from serializers that pre-size arrays) no longer throws a spurious `RangeError`, while a defined entry beyond the consumable range still throws.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `SymbolSpotlight.cycle()` now actually cycles. It previously aborted its own signal on the first line (because `show()` called `hide()`), flashing only the first win line for zero time and ignoring `displayDuration` / `gapDuration` / `cycles`. Teardown between lines is now separated from the cycle-abort, and `hide()` still interrupts a running cycle promptly.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `StopPhase.onSkip()` now places the full target frame (buffers included) instead of slicing to the visible window. A direct `skip()` previously dropped `bufferAbove` / `bufferBelow` targets — e.g. a big symbol's tail parked above the visible area — and landed the wrong frame.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `ReelViewport` dim overlay is now reference-counted. The spotlight and cascade `destroySymbols({ dim })` share one overlay; an overlapping pair no longer hides the dim out from under the other (flicker / lost dim in cascade+win sequences). The overlay hides only when the last consumer releases it.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `RandomSymbolProvider` now fails loud instead of degrading silently — it throws on an empty symbol set or an all-zero total weight (which previously returned `undefined` or ignored weights), and `updateWeights()` drops exclusions referencing symbols no longer present so stale game-mode exclusions don't linger.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: throw on a concurrent `spin()`, `setResult()`, `pin()`, or `setShape()` call while `nudge()` is in flight, instead of leaving the behavior undefined.

- [#140](https://github.com/schmooky/pixi-reels/pull/140) [`d7dfc9d`](https://github.com/schmooky/pixi-reels/commit/d7dfc9d76d3d6d9df1a0e0a93d1c966ecbd29d93) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Perf: the main entry is now under 5 KB gzipped (down from ~20.8 KB) after hiding `SpinController` + the built-in phase classes and moving the testing harness to the `pixi-reels/testing` subpath.

## 0.9.0

### Minor Changes

- [#138](https://github.com/schmooky/pixi-reels/pull/138) [`2728db7`](https://github.com/schmooky/pixi-reels/commit/2728db7db37e231649fc91711511da788cc0d073) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: big-symbol anchors can now sit in bufferAbove or bufferBelow. The classic UK fruit-machine landing. a 1xH wild lands with most of it hidden above the visible window, only the bottom cell ("the tail") shows at row 0. works end-to-end through `setResult`, `refill`, and `nudge`.

  `_coordinateBigSymbols` now iterates the full strip range (`-bufferAbove` to `visibleRows + bufferBelow`) and validates against strip capacity instead of just visible. Anchors at any strip slot are accepted as long as the block fits end-to-end. Pass an anchor at `bufferAbove[i]` via the explicit `ColumnTarget` form (`{ visible: [...], bufferAbove: [...] }`) or via the legacy `frame[col][-1]` negative-index form; the coordinator paints OCCUPIED stubs at the rest of the block's cells (in buffer, visible, or buffer-below as needed).

  The validation error message changed: `exceeds reel height` was visible-only; now reads `extends past the bottom of the strip` with the exact computed values. The new check is more permissive. a 1x4 block on a 3-visible-row reel with 1 bufferBelow is now LEGAL where it previously threw.

  `getSymbolFootprint` may return a negative `anchor.row` for blocks anchored in bufferAbove. `getBlockBounds` handles this by computing pixel coordinates from the row offset directly rather than delegating to `getCellBounds` (which still rejects negative rows). Consumers reading `anchor.row` should accept negative values.

  Fix: `ReelMotion._maxY` was hard-coded to `(visibleRows + 1) * slotH`, which collapsed to `strip[last].y` exactly when `bufferBelow >= 2` and fired a phantom wrap on the first nudge displacement. the anchor landed one strip slot too far. The threshold now scales with `bufferBelow` (`maxY = (visibleRows + bufferBelow) * slotH`), symmetric with the existing `minY = -(bufferAbove + 1) * slotH`. Nudges with `bufferBelow >= 2` now match the documented survival math.

  Live recipes: `/recipes/big-symbol-partial-land/`, `/recipes/big-symbol-held-respin/`.

### Patch Changes

- [#138](https://github.com/schmooky/pixi-reels/pull/138) [`2728db7`](https://github.com/schmooky/pixi-reels/commit/2728db7db37e231649fc91711511da788cc0d073) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Internal: sharpen comments around the big-symbol coordinator's
  uniform-buffer assumption and `_finalizeFrame`'s scan asymmetry. both
  were silently load-bearing on contracts that weren't spelled out.
  Also extends `ColumnTarget.bufferAbove` / `bufferBelow` JSDoc to
  explicitly document the big-symbol anchor capability. discoverable
  in IDE tooltips. No runtime change.

- [#138](https://github.com/schmooky/pixi-reels/pull/138) [`2728db7`](https://github.com/schmooky/pixi-reels/commit/2728db7db37e231649fc91711511da788cc0d073) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `ReelSet.setResult` and `ReelSetBuilder.initialFrame` now throw a `RangeError` when a `ColumnTarget.bufferAbove` / `bufferBelow` carries more entries than the engine's configured `bufferSymbols(...)`, instead of silently dropping the extras.

  Previously, calling `.bufferSymbols(1)` and passing `bufferAbove: ['X', 'Y']` would materialize both `arr[at -1] set to 'X'` and `arr[at -2] set to 'Y'`, but the next clone (`cloneColumn`) only iterates `-1..-bufferAbove`. `Y` was written to the array, dropped on the next pass, and never reached the reel. No error, no warning; the only symptom was "my targeted symbol never lands." Same problem on the `bufferBelow` side via indices past `visible + bufferBelow`.

  The check now fails fast at the API entry point with a column-pointing message: `setResult column 2: bufferAbove has 2 entries but engine bufferSymbols=1. extra entries would be silently dropped. Increase bufferSymbols(...) on the builder or remove the extra entries.` The legacy `frame[col][-k]` form is also validated for negative-index keys beyond `-bufferAbove`. The legacy form's array `length` is intentionally not checked. in MultiWays the per-reel `visibleRows` changes between `setShape()` and `setResult()`, and any length-based check would false-positive on legitimate post-reshape calls.

  This is user-visible error behavior: input that previously silently failed now throws. Callers passing more entries than the configured buffer size should either increase `bufferSymbols(...)` or trim the extra entries.

## 0.8.0

### Minor Changes

- [#136](https://github.com/schmooky/pixi-reels/pull/136) [`743e73d`](https://github.com/schmooky/pixi-reels/commit/743e73de64bb7e02e6142ed284ccd569e03bc555) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `ReelSet.nudge(col, options)`. shift a single reel by N positions after it has landed, revealing caller-supplied `incoming` symbols. The classic UK fruit-machine nudge.

  API surface includes:

  - `NudgeOptions.distance` / `.direction` / `.incoming`. required; `incoming` is top-down by FINAL on-strip position (overflow lands in the matching off-screen buffer).
  - `NudgeOptions.duration` / `.ease`. default `'power2.out'`; overshooting eases are clamped so wraps never fire past the landing position.
  - `NudgeOptions.startDelay`. defer the tween for staggered `Promise.all` waves.
  - `NudgeOptions.signal: AbortSignal`. cancel mid-tween; strip still snaps to landed; promise rejects with `AbortError` and `nudge:cancelled` fires.
  - `ReelSet.skipNudge(col?)` / `Reel.skipNudge()`. fast-forward an in-flight tween; `nudge()` resolves normally.
  - Events: `nudge:start` (after pre-placement), `nudge:complete`, `nudge:cancelled` on the reel-set bus; `phase:enter('nudge')` / `phase:exit('nudge')` per-reel.

  Big-symbol blocks on the target reel are nudged through as a unit when the rotation preserves the block:

  - down: `anchor + h - 1 + distance < total` (block may extend into bufferBelow)
  - up: `anchor - distance >= bufferAbove` (anchor must land in visible. engine doesn't render bufferAbove anchors today)

  Cross-reel blocks (`w > 1`) throw. splitting an anchor from its other-reel cells isn't safe under a single-reel nudge.

  Also fixes `ReelMotion._wrapTopToBottom` to use a symmetric `<= minY` boundary check (previously strict `< minY`, so an upward shift that landed exactly on the threshold no-op'd silently. exposed by `nudge` since standard spinning only moves downward).

## 0.7.0

### Minor Changes

- [#133](https://github.com/schmooky/pixi-reels/pull/133) [`fbe6ac0`](https://github.com/schmooky/pixi-reels/commit/fbe6ac0ed24abdc3d5193dfef455833b7ecb75f3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: speed-scoped tumble overrides + AbortSignal on cascade symbol events.

  `SpeedProfile` now accepts an optional `tumble?: TumbleConfig` field. When the active speed profile defines one, the cascade fall + drop-in phases merge its fields over the base config registered via `.tumble(...)`. so `setSpeed('turbo')` can shorten `fall.duration`, `dropIn.duration`, and per-row staggers, not just the per-reel `stopDelay`. Profiles without a `tumble` field behave identically to before.

  ```ts
  .tumble({ fall: { duration: 300 }, dropIn: { duration: 600, rowStagger: 60 } })
  .speed('default', SPEED_DEFAULT)
  .speed('turbo', {
    ...SPEED_TURBO,
    tumble: {
      fall: { duration: 120 },
      dropIn: { duration: 220, rowStagger: 20 },
    },
  })
  .speed('snap', { ...SPEED_TURBO, tumble: { fall: { duration: 0 }, dropIn: { duration: 0 } } })
  ```

  `cascade:fall:symbol`, `cascade:dropIn:symbol`, and `cascade:gravity:symbol` now carry a `signal: AbortSignal` field. The signal aborts when the phase is skipped / slammed; listeners that schedule parallel tweens (squish, bounce, badge animations) can register a one-shot cleanup so a slam-stop kills their work alongside the library's own timeline. The signal stays un-aborted on natural completion. only explicit skips trigger it.

  ```ts
  events.on("cascade:dropIn:symbol", ({ view, duration, signal }) => {
    const t = gsap.to(view.scale, {
      x: 1.15,
      y: 0.78,
      duration: duration / 1000,
    });
    signal.addEventListener(
      "abort",
      () => {
        t.kill();
        view.scale.set(1, 1);
      },
      { once: true }
    );
  });
  ```

## 0.6.0

### Minor Changes

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: two-stage cascade refill (gravity → hold → drop-in) for tumble slots that want an anticipation beat between survivors landing and new symbols entering.

  The default refill animates survivors and new symbols together in one beat (the Sweet Bonanza / Sugar Rush feel). A handful of slots split it in two: survivors slide first, a global beat for anticipation visuals (multiplier roll, mascot react, SFX peak), then new symbols enter. often staggered per column. That flavor is now first-class.

  Opt in via `mode: 'gravity-then-drop'` on `refill()` (or `refillMode: 'gravity-then-drop'` on `runCascade()`):

  ```ts
  await reelSet.destroySymbols(winners);
  reelSet.setDropOrder("ltr", 110); // per-column wave for stage B

  await reelSet.refill({
    winners,
    grid: nextGrid,
    mode: "gravity-then-drop",
    gravityHoldMs: 350, // anticipation window
  });
  ```

  New options:

  - `refill({ mode })`. `'combined'` (default, unchanged) or `'gravity-then-drop'`.
  - `refill({ gravityHoldMs })`. global pause between gravity end and drop-in start. Default `250`.
  - `refill({ onGravityComplete })`. awaitable hook between stages; extends the hold for async work (multiplier count-ups, etc.).
  - `runCascade({ refillMode, gravityHoldMs, onGravityComplete })`. same options forwarded into every refill in the chain. The hook receives `{ chain, winners }`.

  New events:

  - `cascade:gravity:start`. `{ reelIndex }`. A reel's gravity stage begins.
  - `cascade:gravity:symbol`. same shape as `cascade:dropIn:symbol`, scoped to survivors.
  - `cascade:gravity:end`. `{ reelIndex }`. A reel's gravity stage settled.

  These fire only in two-stage mode; combined mode is unchanged. Per-column stagger inside the drop-in stage uses the existing `setDropOrder('ltr', stepMs)`. `step < dropIn.duration` gives an overlapping wave, `step >= dropIn.duration` gives strictly sequential columns. The gravity stage always runs all reels in parallel.

  See the [Cascade anticipation refill recipe](https://pixi-reels.com/recipes/tumble-anticipation/) for a live example.

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Cascade DX pass: collapse ~30 lines of slot orchestration to ~3 with a canonical detect → destroy → refill chain, retire the legacy `examples/shared/cascadeLoop.ts` helper, and align every recipe / example / doc onto the new API.

  **`reelSet.destroySymbols(cells, opts?)`**. the canonical "fade out winners" step. Defers to each symbol's `playDestroy()` so subclasses (Spine, particles) get art-appropriate disintegration without the spin handler caring. Bumps each view's zIndex so destroys aren't clipped, alternates rotation by column for cohesive cluster pops, optional viewport dim. Replaces ~10 lines of duplicated `destroyWinners` helpers in every cascade recipe.

  **`reelSet.runCascade({ detectWinners, nextGrid, onCascade?, pauseAfterDestroyMs?, maxChain?, destroyOptions?, signal? })`**. the canonical cascade chain orchestration. Loops detect → destroy → pause → refill until `detectWinners` returns `[]`. Caller supplies the game-rules callbacks; the library owns the timing. Both callbacks may be `async`. Pass `signal: AbortSignal` for caller-driven cancellation (the right shape for "player tapped slam between refills," where `reelSet.skip()` is a no-op because the engine is idle). The awaited `RunCascadeResult` (`{ chainLength, totalWinners, finalGrid, wasSkipped }`) is the canonical "the chain is over" signal. no separate event for that, since "round" is a slot-UX term (bet→payout) rather than a reel-engine one and the engine-level "press-spin → all-stopped" is already covered by `spin:start` / `spin:allLanded`.

  **`cascade:place:end`** payload now includes `isInitial: boolean` and `winnerRows: readonly number[]` so decoration listeners can tell new arrivals from survivors sliding into a hole.

  Also exports the named option / result types. `DestroySymbolsOptions`, `RunCascadeOptions`, `RunCascadeResult`. so apps can pass typed config objects around or extend them in adapter layers.

  Non-breaking for the library API. Removed the legacy `examples/shared/cascadeLoop.ts` helper (`runCascade(reelSet, stages, opts)`, `tumbleToGrid`, `diffCells`) since every recipe + example + integration test has been migrated to the new `reelSet.runCascade` / `reelSet.destroySymbols` / `reelSet.refill` surface. Site recipes (`cascade-6x5`, `spin-then-cascade`, `multiways-cascade`, `cascade-winpresenter`, `remove-symbol`) and React recipe components (`RemoveSymbolRecipe`, `CascadeStarterRecipe`) all use the new API; the `cascade-tumble` and `pyramid-cascade` examples were rewritten the same way.

  New guide `your-first-cascade.mdx` walks a tutorial through the canonical API end-to-end. `cascades.mdx` documents the two-moments mental model, the `pauseAfterDestroyMs` / `destroyOptions` / `signal` knobs on `runCascade`, and the choice between `refill()` and `runCascade()`.

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: chain- and destroy-scoped cascade lifecycle events so HUDs and audio buses can hook a cascade chain without polling `isSpinning` (which oscillates between refills).

  New events on `reelSet.events`:

  - `cascade:chain:start`. `{ chain, winners, currentGrid }`. Fired inside `runCascade(...)` after `detectWinners` returns winners, before `destroySymbols` runs. `chain` is 1-indexed.
  - `cascade:chain:end`. `{ chain, winners, nextGrid }`. Mirror of `chain:start`. fired after the refill drop-in settles, before the loop iterates to the next `detectWinners`.
  - `cascade:destroy:start` / `cascade:destroy:end`. `{ cells }`. Fired around every `destroySymbols(...)` call (both direct and inside `runCascade`). Empty-batch calls do not emit. Use these to cue a shatter SFX, dim a HUD, or capture pre-destroy grids for replay logging. without overriding the cascade loop.

  Event ordering per `runCascade()` call (per stage with winners):

  `cascade:chain:start` → `cascade:destroy:start` → (destroy tweens) → `cascade:destroy:end` → `onCascade` callback → pause → refill (`cascade:place:end` + `cascade:dropIn:*` per reel) → `cascade:chain:end`

  The runCascade chain itself is delimited by the returned `Promise`. `await` the call to know when it's done and read the `RunCascadeResult` summary. There is intentionally no `cascade:round:*` event pair: "round" in slot UX is a bet→payout transaction (your concern, not the engine's), and the engine-level "press-spin → all-stopped" is already covered by `spin:start` / `spin:allLanded`.

  Every cascade event uses a consistent three-part `cascade:<scope>:<step>` taxonomy.

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `gravityHold: Promise<void>` to `refill()` and `runCascade()` so callers can gate the drop-in stage on an already-in-flight animation / SFX / network call without wrapping it in a callback.

  ```ts
  // Single refill. pass the promise directly.
  await reelSet.refill({
    winners,
    grid: next,
    mode: "gravity-then-drop",
    gravityHoldMs: 150, // minimum wall-clock floor
    gravityHold: multiplierRoll.done, // wait for the in-flight roll
  });
  ```

  `gravityHoldMs` and `gravityHold` race in **parallel** via `Promise.all`. whichever finishes LAST gates the drop-in. Pass both when you want a wall-clock floor under an animation that might finish quickly. `onGravityComplete` (the existing callback hook) still runs AFTER both resolve, so it can read post-hold state.

  ```ts
  // Per-cascade. runCascade calls the builder once per stage.
  await reelSet.runCascade({
    detectWinners,
    nextGrid,
    refillMode: "gravity-then-drop",
    gravityHoldMs: 150,
    gravityHold: ({ chain, winners }) => {
      multiplier.bumpTo(chain + 1);
      return multiplier.done; // each cascade waits for its own roll
    },
  });
  ```

  Site recipes: SPIN/SKIP button is now bigger (56x56 vs 40x40), vertically centered on the right edge of the canvas, and uses the `SkipForward` icon (lucide-react) instead of `Square` when active. Larger touch target, more obvious as the primary action.

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Round-aware slam-stop: single-press `skip()` with side effects, new `slamStop()`, new `skipStage`.

  `ReelSet.skip()` is now round-aware. A "round" is one `spin()` plus all its `refill()`s, until the next `spin()`. The first press of `skip()` in a round slams the current drop AND applies a round-scoped side effect:

  - **Standard mode**: boosts the active speed profile to the fastest registered one (emits `skip:boosted`). The speed takes effect on the NEXT spin (mid-spin speed switching is not supported by phases). Boost persists across `refill()` calls and is restored on the next `spin()`. unless the app changed speed manually between rounds, in which case the manual choice is preserved.
  - **Cascade/tumble mode**: flags the round so every subsequent `refill()` auto-slams with no animation. One press ends a multi-drop cascade.

  Subsequent `skip()` presses in the same round each slam the current drop. The universal `if (isSpinning) reelSet.skip()` button pattern across recipes now always lands the spin on a single press, while still benefiting from the boost / auto-slam side effect.

  Breaking:

  - `skip()` no longer needs two presses to slam. single press lands the drop. Callers that already relied on `skip()` slamming work as before. Callers expecting a _non-slamming_ "boost only" press should use `reelSet.setSpeed('superTurbo')` directly.
  - `skip()` THROWS if called before `setResult()` arrives (no result to land on. pre-result slam would land on random spin-buffer state). Use `requestSkip()` for the deferred-slam pattern, or wrap `skip()` in `try { ... } catch {}` and route to `requestSkip()` in the catch. Refill paths take a result at entry, so this guard only fires in the initial-spin pre-`setResult` window.
  - `requestSkip()` bypasses staging entirely and slams when `setResult()` arrives.
  - The test harness `spinAndLand()` was migrated to `slamStop()` to keep its semantics explicit.

  Added:

  - `ReelSet.slamStop()`. always slams, no side effects.
  - `ReelSet.skipStage`. `0 | 1 | 2` getter; `0` until the first press, `2` after. (`1` is reserved for forward compat.)
  - `skip:boosted` event. `{ previous, current }: SpeedProfile`. Fires only on standard-mode boost; cascade auto-slam doesn't emit it.
  - `ReelSymbol.playDestroy(opts?)`. `opts.direction: 1 | -1` for coherent rotation (e.g. `w.reel % 2 === 0 ? 1 : -1`), `opts.delay: number` (seconds) for per-winner stagger, and `opts.signal: AbortSignal` so a mid-destroy abort can snap to the destroyed pose without waiting for the full ~300 ms tween. Default direction stays random for back-compat.

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Replace `.cascade()` with `.tumble()` and split cascade-drop into three independently overridable phases.

  Breaking changes: `.cascade(DropRecipes...)` is removed. `DropRecipes`, `DropStartPhase`, `DropStopPhase`, `CascadeAnticipationPhase`, and their `*Config` types no longer export from `pixi-reels`. Use `.tumble({ fall, dropIn })` on the builder and override individual phases via `.phases(f => f.register('cascade:fall'|'cascade:place'|'cascade:dropIn', MyPhase))`.

  New: `reelSet.refill({ winners, grid })` for Moment B cascade refills. Gravity-correct geometry. untouched survivors stay, survivors above a hole slide down, new symbols enter from above into the top `winners.length` rows. Per-symbol `cascade:fall:symbol` / `cascade:dropIn:symbol` events fire right before each tween so listeners can run parallel tweens on any view property in sync with the library's motion. Per-reel boundary events: `cascade:fall:start` / `cascade:fall:end` / `cascade:place:end` / `cascade:dropIn:start` / `cascade:dropIn:end`.

  See `docs/recipes/tumble-cascade.md` for the full recipe (drop-on-click, server wait with spinner, cascading multiplier).

### Patch Changes

- [#120](https://github.com/schmooky/pixi-reels/pull/120) [`579ed0c`](https://github.com/schmooky/pixi-reels/commit/579ed0c2d16ba36b2672a55c251b9e029db4f088) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix five audit-discovered defects in the tumble-cascade pipeline:

  - `CascadeFallPhase` / `CascadeDropInPhase` now emit their `:end` events on skip. Previously a slam mid-fall (or mid-drop, mid-gravity) killed the timeline without firing the paired `cascade:fall:end` / `cascade:dropIn:end` / `cascade:gravity:end`, so any HUD or audio bus pairing `:start` / `:end` to track in-flight cascade work drifted out of balance on every slam. The pre-fall delay window (where `:start` has not yet fired) still skips silently, so no unpaired `:end` is emitted.

  - `runCascade({ gravityHold })` now invokes the per-cascade builder at the **gravity-end boundary** as documented, not at refill-start. Side effects in the builder (e.g. `multiplier.bumpTo(chain + 1); return multiplier.done`) now line up with the gravity-end beat the player sees. To support this, `refill({ gravityHold })` accepts a factory `() => Promise<void>` in addition to a bare `Promise<void>`. pass a factory when the side effect of starting the promise should fire at gravity-end; pass a bare promise when you already hold an in-flight handle.

  - `runCascade({ pauseAfterDestroyMs })` wait is now cancellable via `signal`. Previously an abort during the pause ran the setTimeout to completion before the loop exited. up to `pauseAfterDestroyMs` of dead air between slam intent and exit. Now the wait races against `signal.aborted` and unblocks within a microtask.

  - A new `cascade:gravity:error` event surfaces user-supplied `gravityHold` / `onGravityComplete` rejections (or throws). The engine still slams to recover so the refill promise settles, but the original rejection reason is no longer silently swallowed. listen on the event to forward the error to your own logger / alarm. The console.error log was also tightened to identify the likely culprit.

  - `movePin` `onFlightCreated` / `onFlightCompleted` hook throws now log via `console.error` instead of being silently swallowed. The animation still continues (a throwing hook MUST NOT leak a flight symbol or leave the pin map out of sync) but the bug is no longer invisible.

  Also clarifies the `skip()` documentation: `skip()` THROWS before `setResult()` arrives. The docstring on `requestSkip()` and `skipStage` now notes that queued-pre-`setResult` requests do not advance `skipStage` until the slam fires.

## 0.5.0

### Minor Changes

- [#111](https://github.com/schmooky/pixi-reels/pull/111) [`dc2a526`](https://github.com/schmooky/pixi-reels/commit/dc2a526cf13c8670d10680f9104b93675332468f) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: cascade + multiways combination. `ReelSetBuilder.multiways(...)` can now be paired with `.cascade(...)` or `spinningMode(new CascadeMode())`. the build-time throw added in ADR 012 is lifted. `AdjustPhase` runs between `SpinPhase` and `DropStopPhase` so the new shape commits before the drop-in fills it. Shape changes apply per-spin only; mid-cascade-chain reshape is unsupported (see ADR 015). Closes [#74](https://github.com/schmooky/pixi-reels/issues/74).

- [#116](https://github.com/schmooky/pixi-reels/pull/116) [`7afe3a9`](https://github.com/schmooky/pixi-reels/commit/7afe3a9a6edd70aaab4c985fb0167050e93fbd49) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `ColumnTarget`. explicit `{ visible, bufferAbove?, bufferBelow? }` input shape. Accepted by both `ReelSet.setResult` and `ReelSetBuilder.initialFrame` alongside the legacy `string[][]` form. Survives `structuredClone`, JSON, and `postMessage` (the legacy negative-index form does not).

  Fix: `setResult` (legacy `string[][]` form) now honours `frame[col][-1]…[-bufferAbove]` end-to-end. Previously the negative-index slots were dropped inside `_applyPinsToGrid` (when pins were active) and `_coordinateBigSymbols` (always) by plain spread clones, so the convention only worked through `initialFrame`. The clones now use a property-preserving helper.

  Fix: `Reel.placeSymbols` (skip / turbo land path) now reads the negative-index slot for the buffer-above cell instead of always random-filling it. Buffer-below targeting via `symbolIds[visibleRows]` is unchanged.

### Patch Changes

- [#115](https://github.com/schmooky/pixi-reels/pull/115) [`1f30d8e`](https://github.com/schmooky/pixi-reels/commit/1f30d8e1b5d997872c85400122ee2613d35e0933) Thanks [@MaksimKiselev](https://github.com/MaksimKiselev)! - Fix: negative indices in `initialFrame` now correctly populate buffer-above slots. Setting `frame[col][-1]` (or `[-2]` for deeper buffers) places the symbol in the corresponding buffer-above cell instead of being silently ignored.

## 0.4.0

### Minor Changes

- [#98](https://github.com/schmooky/pixi-reels/pull/98) [`b4bacca`](https://github.com/schmooky/pixi-reels/commit/b4bacca9bac5aa6048ca9d5062de8ef1e04aeeea) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Auto-pick `SharedRectMaskStrategy` when any registered symbol has `unmask: true` and `symbolGap.x > 0`.

  The default `RectMaskStrategy` draws one mask rect per reel, with the gaps between reels NOT clipped. fine in the common case. But when an `unmask: true` symbol renders above the reel mask, neighboring (still-masked) symbols on adjacent reels visibly clip at the column gap, and players see a half-cropped neighbor next to the unmasked overlay.

  The auto-pick now triggers in either case:

  - **big symbols** registered (`SymbolData.size` with `w > 1` or `h > 1`), or
  - **unmasked symbols** registered (`SymbolData.unmask: true`),

  provided the layout has a horizontal gap (`symbolGap.x > 0`). Explicit `.maskStrategy(...)` calls always win.

  Console emits a one-line `console.info` hint identifying which condition triggered the auto-pick. Pairs with the existing big-symbol auto-pick. the same mechanism, broader trigger set.

- [#91](https://github.com/schmooky/pixi-reels/pull/91) [`d211ca4`](https://github.com/schmooky/pixi-reels/commit/d211ca495e626c18b92187902a527aa182d0bbbb) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `ReelSetBuilder.gsap(instance)` for explicit GSAP dependency injection.

  The engine internally drives every tween, timeline, and `delayedCall` through a single bound `gsap` instance. By default that is the `gsap` resolved at the engine's own module path. fine for the common case where bundler `dedupe` collapses both the engine's and the consumer's `'gsap'` to one module instance.

  In setups where two `gsap` instances exist at runtime (symlinked workspaces, npm-link, misconfigured `dedupe`), tweens started by the engine live on a different root timeline than the one the consumer drives. animations stall, double-fire, or freeze on hidden tabs. Calling `.gsap(myGsap)` in the builder rebinds the engine to the consumer's instance:

  ```ts
  import { gsap } from 'gsap';

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleRows(3).symbolSize(200, 200)
    .symbols(...)
    .ticker(app.ticker)
    .gsap(gsap)         // ensure engine and app share one instance
    .build();
  ```

  Internally this is implemented via a tiny `getGsap()`/`setGsap()` shim in `utils/gsapRef.ts`. Every internal animation site now reads through `getGsap()` instead of importing `'gsap'` directly. A regression-guard test asserts no runtime `gsap.timeline(`/`gsap.to(`/`gsap.delayedCall(` calls outside the shim itself.

  No behavioural change for consumers who don't call `.gsap()`.

- [#99](https://github.com/schmooky/pixi-reels/pull/99) [`544607d`](https://github.com/schmooky/pixi-reels/commit/544607d8f413d9fa7dfcba65f3219819096a65f6) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add a frame-state recorder to the debug module: `startRecording(reelSet, tag)`, `stopRecording(reelSet)`, `getFrames(tag?)`, `clearFrames()`.

  Each lifecycle event (`spin:start`, `spin:reelLanded`, `spin:allLanded`, `spin:complete`) captures one `DebugSnapshot` while a recording session is active. Frames are tagged with the string passed to `startRecording`, so multiple sessions can share one global log and be filtered out via `getFrames(tag)`. Per-process buffer is capped at 1000 frames by default (rolling window); override via `startRecording(reelSet, tag, { maxFrames })`. Recording auto-detaches when the reel set emits `'destroyed'`.

  Designed for AI agents and debug harnesses that need a frame-by-frame trace of a spin sequence. particularly useful for diagnosing flicker, double-fires, or off-by-one frame issues that aren't visible from a single point-in-time `debugSnapshot`.

  Also exposed on `__PIXI_REELS_DEBUG` after `enableDebug(reelSet)`:

  ```js
  __PIXI_REELS_DEBUG.startRecording("my-tag");
  await reelSet.spin();
  __PIXI_REELS_DEBUG.stopRecording();
  __PIXI_REELS_DEBUG.getFrames("my-tag");
  ```

  `startRecording` is idempotent per reel set. calling it twice on the same set replaces the prior session.

- [#95](https://github.com/schmooky/pixi-reels/pull/95) [`1abfc45`](https://github.com/schmooky/pixi-reels/commit/1abfc45a445ec9491ddee69367f827333735acdf) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `Reel.setSymbolAt(visibleRow, symbolId)` and `ReelSet.setSymbolAt(col, row, symbolId)`. public API for swapping a single visible cell's symbol identity in place at rest.

  Useful for live presentation effects that don't fit the `setResult` / `placeSymbols` flow:

  - converting a symbol to a wild after a cascade pop,
  - swapping to a sticky variant after a win is paid out.

  The method funnels into the same internal activate path as the rest of the engine, so the swapped-in symbol gets its proper parent (masked vs unmasked container), `zIndex`, and visual reset for free. no follow-up `refreshZIndex` required.

  Validation (all guards fail loud):

  - throws if the reel is in motion (`speed !== 0` or `isStopping`). a mid-spin swap would be overwritten by the next wrap/stop frame anyway.
  - throws if `visibleRow` is not an integer in `[0, visibleRows)`.
  - throws if `symbolId` is not registered.
  - throws if the target row is a non-anchor cell of a big-symbol block.
  - throws if the target row currently holds the anchor of a big-symbol block. big blocks span multiple cells (and possibly reels) and require `placeSymbols` plus the cross-reel OCCUPIED coordinator.
  - throws if `symbolId` itself is a big symbol. same reason.
  - `ReelSet.setSymbolAt` additionally throws if the cell currently has an active pin; call `unpin(col, row)` first to overwrite.

  Emits `symbol:created` on the per-reel event bus, matching motion-driven swaps.

- [#78](https://github.com/schmooky/pixi-reels/pull/78) [`9f6f0da`](https://github.com/schmooky/pixi-reels/commit/9f6f0dac52bcb01936422e719db020c2e6b76280) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `reelSet.spin({ holdReels: [...] })` for subset spinning.

  Held reels skip START / SPIN / STOP entirely and stay on whatever symbols they're currently showing. no more "fragment the board into one ReelSet per column" workaround for Hold & Win, sticky / expanding wilds, or trigger-column bonus respins. Held reels count as already-landed for the `spin:allLanded` resolver, so only the non-held reels actually animate.

  ```ts
  // Hold reels 0 and 4; only reels 1, 2, 3 reroll.
  const spin = reelSet.spin({ holdReels: [0, 4] });
  reelSet.setResult(serverGrid); // entries at 0/4 are ignored
  await spin;
  ```

  Behaviour:

  - `setResult(grid)` still expects a full `reelCount`-length grid; held entries are ignored.
  - `setAnticipation([...])` silently filters held indices.
  - `setStopDelays([...])` entries at held indices are ignored.
  - No `spin:reelLanded` / `spin:stopping` event fires for held reels; `spin:allLanded` fires once every non-held reel lands.
  - Out-of-range / duplicate / non-integer entries in `holdReels` are silently filtered.
  - Big-symbol blocks crossing the held / non-held boundary are not supported. author results so big symbols stay inside a contiguous run of non-held reels.

  Exports `SpinOptions` from the package root.

- [#92](https://github.com/schmooky/pixi-reels/pull/92) [`aa8be14`](https://github.com/schmooky/pixi-reels/commit/aa8be149aa7c9f8ff4195b6850b767b8bf402bcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Make `SymbolData.unmask: true` actually re-parent the symbol view to `viewport.unmaskedContainer`.

  Until now the `unmask` flag on `SymbolData` was accepted by the builder but never read by the engine. symbols always landed inside the reel's masked container regardless of the flag. With this change, every code path that places a symbol into the reel. `_setupSymbolPositions`, `_replaceSymbol` (both stub-install and stub-replace branches and the regular swap), and `reshape`. consults `_symbolsData[id].unmask` and parents the view to `viewport.unmaskedContainer` when set.

  When unmasked, the engine sets the view's X to `reel.container.x` and adds `reel.container.y` to the view's Y so the at-rest cell position aligns with the reel column (since `unmaskedContainer` sits at viewport-local 0,0).

  Documented limitation in `SymbolData.unmask` JSDoc: `ReelMotion` writes `view.y` in reel-local coords every frame, so an unmasked symbol on the strip will appear shifted vertically by `reel.container.y` while the reel is spinning. Treat `unmask: true` as a _landed-state_ flag. it is correct at rest and during static frames, but not designed to stay visually accurate while the reel is spinning. For mid-spin "stays visible above mask" overlays, use a cell pin instead.

  **Pyramid layouts:** registering any unmasked symbol on a slot where any reel has a non-zero `offsetY` (pyramid / trapezoid) now throws at `build()`. Reason: the same motion-layer issue persists at landing. `snapToGrid` writes reel-local Y, mispositioning the unmasked view by `reel.container.y` even at rest. Use cell pins for above-mask overlays on pyramid slots, or remove the per-reel offset.

- [#104](https://github.com/schmooky/pixi-reels/pull/104) [`1dc8d08`](https://github.com/schmooky/pixi-reels/commit/1dc8d084ad171b8347312991c98cfbfc07bed451) Thanks [@feddorovich](https://github.com/feddorovich)! - `reelSet.spin()` accepts an optional `{ mode: 'standard' | 'cascade' }` argument that picks the phase chain for a single spin. Tumble-cascade slots can now do classic strip-spin + bounce on the first round and drop-in tumble on subsequent waves.

  `.cascade(...)` on the builder still wires the drop-in phases. but they are now registered under `dropStart` / `dropStop` keys instead of overwriting `start` / `stop`. The default mode flips to `'cascade'` when `.cascade(...)` was called, so existing callers that just call `spin()` without args see no change.

  Calling `spin({ mode: 'cascade' })` on a builder that didn't configure `.cascade(...)` throws a clear error. The new `SpinOptions` type is exported from the package barrel.

- [#103](https://github.com/schmooky/pixi-reels/pull/103) [`18474ee`](https://github.com/schmooky/pixi-reels/commit/18474eebbc0ed16b63f2e6b9f8af1acb9c5ea2d2) Thanks [@feddorovich](https://github.com/feddorovich)! - Added `ReelSet.requestSkip()` (and `SpinController.requestSkip()`). a slam-stop entry point that's safe to call before `setResult()` arrives. If the result is already pending, it behaves exactly like `skip()`. Otherwise the skip is queued and fires automatically as soon as `setResult()` lands.

  Use this from UI handlers in server-driven slots: a player tapping the spin button to slam-stop before the WebSocket response reaches the client no longer snaps every reel onto whatever buffer state happened to be mid-scroll. Existing `skip()` is unchanged.

### Patch Changes

- [#93](https://github.com/schmooky/pixi-reels/pull/93) [`f111da8`](https://github.com/schmooky/pixi-reels/commit/f111da858ec0ca11a72ac389538b29f43f8c4262) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `Reel._replaceSymbol` now sets the canonical zIndex inline on every symbol activation.

  Previously the activate path set `view.zIndex = 0` and relied on a follow-up `refreshZIndex()` call to apply the real formula `(symbolData.zIndex ?? 0) * 100 + arrayIndex`. All current callers happen to call `refreshZIndex` after, but the contract was fragile: any future caller that swapped a single symbol via the activate path would see the wrong layering until the next motion-wrap.

  A new private helper `_computeSymbolZIndex(symbolId, index)` centralizes the formula and is used by both `refreshZIndex` (full rescan) and `_replaceSymbol` (single-symbol activate). OCCUPIED stubs receive `arrayIndex` directly, matching what `refreshZIndex` would assign.

  No public API change. The fix unblocks future single-symbol swap APIs (e.g. a public `setSymbolAt`) without forcing every caller to remember to `refreshZIndex` afterwards.

- [#97](https://github.com/schmooky/pixi-reels/pull/97) [`db32899`](https://github.com/schmooky/pixi-reels/commit/db32899c832ce68e7ba1aaf797bedaf3a85d6fa3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `ReelSetBuilder.bufferSymbols(count)` now clamps `0`, negative numbers, `NaN`, and non-finite values to the minimum of 1, with a single console warning per process.

  Buffer rows are off-screen cells the reel keeps around the visible window so symbols can fade/slide in cleanly. The motion layer's wrap detection assumes at least one buffer row above and one below. passing `0` would produce an inconsistent state that surfaced later as visible flicker on motion-wrap, not as a clear configuration error at build time.

  The clamp is preferred over a thrown error so existing user code that accidentally passed `0` keeps running. The warning fires once per process (regardless of how many builders hit the bad value) so logs stay readable when a faulty default is wired into a loop.

- [#94](https://github.com/schmooky/pixi-reels/pull/94) [`6a5c8d1`](https://github.com/schmooky/pixi-reels/commit/6a5c8d192025c0746cab311491b2984173c15d30) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `SpineReelSymbol` one-shot animation promises (`playWin` / `playLanding` / `playOut`) no longer dangle when the track is hijacked.

  Three previously-leaking scenarios now settle the returned promise instead of hanging forever:

  - **Concurrent one-shots**. calling `playOut()` while `playWin()` is in flight resolves the prior `playWin` promise (its track was overwritten) before starting the new one.
  - **`playBlur` mid-animation**. entering a SPIN that triggers blur while a win is still animating settles the win promise.
  - **Listener leak**. back-to-back one-shots no longer accumulate stale listeners on the Spine state. Each new one-shot detaches the prior listener.

  Refactored to a single internal `_resolveOneShot()` helper called from `onActivate`, `onDeactivate`, `stopAnimation`, `playBlur`, and the start of every new `_playOneShot`. The track-entry guard (`done !== entry`) is preserved so unrelated entries firing complete on the same track are correctly ignored.

  This unblocks reliable `await symbol.playWin()` patterns in win presenters and cascade orchestration.

- [#77](https://github.com/schmooky/pixi-reels/pull/77) [`265136a`](https://github.com/schmooky/pixi-reels/commit/265136a58cbcc4b289b6a070928345ca656c2cc1) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: stop reparenting recycled symbols on spotlight hide and always anchor `Reel._replaceSymbol` to its own container.

  Two related bugs caused symbols to render in the wrong reel after rapid spin/skip cycles, particularly when the win spotlight runs alongside an expanding-wild mechanic that triggers many `placeSymbols` calls in quick succession:

  - `SymbolSpotlight.hide()` reparented every symbol it had ever tracked back to its `originalParent`, even when `promoteAboveMask: false` (no reparenting on `show()`) or after the shared symbol pool had recycled the instance into a different reel. The recycled symbol got yanked from its new owner, leaving a hole there and a stranger in the original reel.
  - `Reel._replaceSymbol` used the captured `oldSymbol.view.parent` as the destination for the replacement view. If the old symbol had been moved (by the spotlight or by pool recycling), the new symbol landed in a foreign container. symbols accumulated in the wrong reel across spins.

  Both paths now anchor to the reel's own container; the spotlight only reparents symbols whose view is still in `spotlightContainer` (i.e., never recycled away).

- [#101](https://github.com/schmooky/pixi-reels/pull/101) [`7a7670c`](https://github.com/schmooky/pixi-reels/commit/7a7670cf1a98e2b2778069a728147452ece2dc66) Thanks [@feddorovich](https://github.com/feddorovich)! - `ReelSymbol.activate()` and `ReelSymbol.deactivate()` now both reset the container's `alpha`, `scale`, `rotation`, `filters`, and `zIndex`. Previously a subclass that decorated `view` from a spin-lifecycle hook (e.g. attaching a `BlurFilter` in `onReelSpinStart`) had to remember to undo every property on its own. and any path that skipped a hook (a buffer cell that exited spin without `onReelSpinEnd`, a slam-stop that bypassed the lifecycle) left a recycled symbol carrying stale state into its next life. The most visible symptom was a "blurred" cell appearing after a cascade refill once a symbol had been pooled mid-spin.

  `ReelSymbol.destroy()` now inlines the lifecycle hooks (`stopAnimation`, `onDeactivate`) instead of going through `deactivate()`, so it doesn't try to reset transform / filter state on a view that was already torn down by a parent `container.destroy({ children: true })`.

  The same-id early-return path inside `Reel._setSymbolAt` bypasses the deactivate/activate cycle, so the matching reset has been added there too.

  No public API change. Subclasses that already cleared their own filter / transform state continue to work and just do a few redundant assignments.

- [#102](https://github.com/schmooky/pixi-reels/pull/102) [`a2be4b8`](https://github.com/schmooky/pixi-reels/commit/a2be4b83544b66bd3650f14de251dcf51424b552) Thanks [@feddorovich](https://github.com/feddorovich)! - `SpinController.skip()` now fires `onReelSpinEnd` and `onReelLanded` on every reel that hadn't already landed, regardless of which phase was active when the slam-stop arrived. Previously these symbol-level hooks fired only when the active phase happened to be `StopPhase` or `DropStopPhase` (their `onSkip()` called the notifications); a skip during `StartPhase` / `SpinPhase` / `AnticipationPhase` / `AdjustPhase` left visible symbols without an end-of-spin signal. most visibly, motion blur (or any other decoration attached in `onReelSpinStart`) stayed on the cell after the slam.

  The notifications moved out of `StopPhase.onSkip` / `DropStopPhase.onSkip` into the controller so there's a single source of truth and no double-fire. Natural-stop flow is unchanged. those phases still fire the hooks themselves before the bounce.

## 0.3.2

### Patch Changes

- [`b86dad7`](https://github.com/schmooky/pixi-reels/commit/b86dad75fcdd4936170bb96a6084904bad419dd3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: ship `CONTRIBUTING.md` in the npm tarball so the npmjs.com "Contributing" sidebar link resolves. npmjs builds that link from `repository.directory` (`packages/pixi-reels`) and a standard filename, but the file previously only existed at the monorepo root. the link 404'd. The build script now syncs `CONTRIBUTING.md` into the package alongside `README.md` and `LICENSE`, and the package's `files` array includes it.

## 0.3.1

### Patch Changes

- [`93aa66c`](https://github.com/schmooky/pixi-reels/commit/93aa66c103ef0f624345c76a92a22621fc3c676a) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Update: package `homepage` now points at the canonical docs site, `https://pixi-reels.schmooky.dev`. No code or runtime change. npm metadata and the docs site URL only.

## 0.3.0

### Minor Changes

- [#61](https://github.com/schmooky/pixi-reels/pull/61) [`28551ca`](https://github.com/schmooky/pixi-reels/commit/28551ca72e6cbc1e95984cf1b35e71bdb5f18d22) Thanks [@schmooky](https://github.com/schmooky)! - Add: per-reel geometry, MultiWays, big symbols, and expanding wilds.

  - **Per-reel static shape (pyramids):** `builder.visibleRowsPerReel([3, 5, 5, 5, 3])`, optional `reelPixelHeights`, `reelAnchor: 'top' | 'center' | 'bottom'`. Reels can now have non-uniform row counts at build time.
  - **MultiWays (per-spin row variation):** `builder.multiways({ minRows, maxRows, reelPixelHeight })` plus `reelSet.setShape(rowsPerReel)` mid-spin. A new `AdjustPhase` (inserted only when `.multiways(...)` is called) reshapes reels between SPIN and STOP. Pin migration follows: pins gain a frozen `originRow` and migrate back toward it on each reshape.
  - **Big symbols (`N×M` blocks):** `register('bonus', SymbolClass, { size: { w: 2, h: 2 } })`. The result grid stays `string[][]`. the engine paints OCCUPIED across the block. `getSymbolFootprint(col, row)` resolves any cell to the anchor.
  - **Expanding wilds:** unchanged from the existing pin API; reaffirmed via tests as a degenerate big-symbol case.

  New events: `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated`. They only fire on MultiWays slots. non-MultiWays event surfaces are unchanged.

  New runtime: `reelSet.setShape()`, `reelSet.getSymbolFootprint()`, `reelSet.getVisibleGrid()`, `reelSet.isMultiWaysSlot`. New builder fluents: `.visibleRowsPerReel()`, `.reelPixelHeights()`, `.reelAnchor()`, `.multiways()`, `.pinMigrationDuration()`, `.pinMigrationEase()`. Pin gains optional `originRow`.

  AdjustPhase animates the reshape: every visible symbol tweens its height + Y from the old shape to the new one over `pinMigrationDuration` ms with the configurable `pinMigrationEase`. Pin overlays tween in lock-step so a sticky wild visibly slides to its migrated row. Set `pinMigrationDuration(0)` for an instant snap.

  Constraints: big symbols and MultiWays are mutually exclusive per slot in v1. Cascade mode + MultiWays throws at build.

  **Breaking** (debug-only, not protected by semver but called out): `DebugSnapshot.visibleRows` widens from `number` to `number[]` so jagged shapes are representable. Adapt downstream code that deep-reads the snapshot.

### Patch Changes

- [#61](https://github.com/schmooky/pixi-reels/pull/61) [`4b22c00`](https://github.com/schmooky/pixi-reels/commit/4b22c00b0f5733d141de1fee4ed8bf515cc2a513) Thanks [@schmooky](https://github.com/schmooky)! - Fix and harden a handful of follow-ups from the per-reel-geometry / MultiWays / big-symbols PR:

  - `Reel.reshape()` now keeps `_reelHeight` in sync with the new geometry so the field doesn't go stale after a reshape. Previously a direct external call left `reelHeight` reporting the construction-time value. The method is also marked `@internal` in JSDoc. `ReelSet.setShape()` is the supported entry point.
  - `ReelSetBuilder.maskStrategy()` now validates its argument synchronously: passing `null`, `undefined`, or an object missing `build()` / `update()` methods throws with a grep-able error instead of crashing later inside `ReelViewport`.
  - Added a comment in `SpinController.skip()` documenting the reshape-on-skip contract. pin overlays migrate instantly on slam-stop regardless of `pinMigrationDuration`, and the rationale (overlays are destroyed at land anyway).

  No new public API; behaviour for existing well-formed callers is unchanged.

## 0.2.0

### Minor Changes

- [`3fd806a`](https://github.com/schmooky/pixi-reels/commit/3fd806a31d76be5fc6ac7ff8e23852814c542e1a) - Backfill for three engine PRs merged without changesets after `0.1.0`:

  - Cascade drop-in mechanic and anticipation recipe ([#51](https://github.com/schmooky/pixi-reels/issues/51)).
  - Engine primitives: `CellPin`, `movePin`, and `reelSet.frame` exposure ([#52](https://github.com/schmooky/pixi-reels/issues/52)).
  - `ReelSet.getCellBounds` for overlays, paylines, and hit areas ([#53](https://github.com/schmooky/pixi-reels/issues/53)).

  All three are additive, so this bundles them into a single minor bump.

- [`555c9f0`](https://github.com/schmooky/pixi-reels/commit/555c9f007d749a8e2329a53dc17208fc94d7b5f3) - Add: `WinPresenter`. a minimal win-presentation layer that animates winning cells and fires events. Paylines, cluster pops, scatter splashes all use the same shape. The library never draws lines or overlays; user code does that by reacting to events.

  - `WinPresenter.show(wins: Win[])`. animates each win's cells, one by one. `stagger: 0` flashes simultaneously, `stagger > 0` sweeps left-to-right in cell order.
  - `Win`. one shape: `{ cells: SymbolPosition[]; value?: number; kind?: string; id?: number }`. Covers paylines, clusters, cascade pops, scatters.
  - `dimLosers` (default 0.35 alpha) fades non-winning cells during each win; restored on `win:end`.
  - `symbolAnim`: `'win'` (default, calls `playWin()`), a named spine animation, or `(symbol, cell, win) => Promise<void>` for a custom callback.
  - Events fire on `ReelSet.events`: `win:start` (full list), `win:group` (per-win), `win:symbol` (per-cell), `win:end` (`complete` / `aborted`). Subscribe with `reelSet.getCellBounds` to draw any overlay you want.
  - Cascades: call `presenter.show([{ cells: winners }])` from `runCascade`'s `onWinnersVanish` hook. same API.
  - Helper: `sortByValueDesc` exported for convenience.
  - Types: `Win`, `SymbolPosition` (canonicalised to `config/types`, re-exported from events).
  - Reels now have an explicit `container.zIndex = reelIndex` so the viewport's sorted `maskedContainer` draws reels deterministically. same order as before, but callers can flip it for bottom-left diagonal overflow.

  No existing API is changed or removed.

### Patch Changes

- [`7792142`](https://github.com/schmooky/pixi-reels/commit/779214217bb341cfb66f2db74616b2e8608893b9) - Fix: Two `AnimatedSpriteSymbol` bugs that only manifest on symbols with non-trivial win animations:

  - `resize()` now positions the sprite according to its configured anchor, so `anchor: { x: 0.5, y: 0.5 }` renders the symbol centred in its cell instead of with its centre pinned to the cell's top-left corner (which clipped three quarters of the symbol under the reel mask). `anchor: (0, 0)`. the prior default and only combination that worked. is unchanged.
  - `playWin()` now returns the animation to frame 0 (`gotoAndStop(0)`) when the sequence completes, so the idle visible state settles on the neutral base frame. Previously the sprite held its last animation frame indefinitely. fine for symmetric pulses that happen to end where they started, a visible glitch for anything else (AI-generated or keyframe sequences that end mid-action).
