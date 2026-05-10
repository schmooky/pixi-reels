# pixi-reels

## 0.4.0

### Minor Changes

- [#98](https://github.com/schmooky/pixi-reels/pull/98) [`b4bacca`](https://github.com/schmooky/pixi-reels/commit/b4bacca9bac5aa6048ca9d5062de8ef1e04aeeea) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Auto-pick `SharedRectMaskStrategy` when any registered symbol has `unmask: true` and `symbolGap.x > 0`.

  The default `RectMaskStrategy` draws one mask rect per reel, with the gaps between reels NOT clipped — fine in the common case. But when an `unmask: true` symbol renders above the reel mask, neighboring (still-masked) symbols on adjacent reels visibly clip at the column gap, and players see a half-cropped neighbor next to the unmasked overlay.

  The auto-pick now triggers in either case:

  - **big symbols** registered (`SymbolData.size` with `w > 1` or `h > 1`), or
  - **unmasked symbols** registered (`SymbolData.unmask: true`),

  provided the layout has a horizontal gap (`symbolGap.x > 0`). Explicit `.maskStrategy(...)` calls always win.

  Console emits a one-line `console.info` hint identifying which condition triggered the auto-pick. Pairs with the existing big-symbol auto-pick — the same mechanism, broader trigger set.

- [#91](https://github.com/schmooky/pixi-reels/pull/91) [`d211ca4`](https://github.com/schmooky/pixi-reels/commit/d211ca495e626c18b92187902a527aa182d0bbbb) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `ReelSetBuilder.gsap(instance)` for explicit GSAP dependency injection.

  The engine internally drives every tween, timeline, and `delayedCall` through a single bound `gsap` instance. By default that is the `gsap` resolved at the engine's own module path — fine for the common case where bundler `dedupe` collapses both the engine's and the consumer's `'gsap'` to one module instance.

  In setups where two `gsap` instances exist at runtime (symlinked workspaces, npm-link, misconfigured `dedupe`), tweens started by the engine live on a different root timeline than the one the consumer drives — animations stall, double-fire, or freeze on hidden tabs. Calling `.gsap(myGsap)` in the builder rebinds the engine to the consumer's instance:

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

  Designed for AI agents and debug harnesses that need a frame-by-frame trace of a spin sequence — particularly useful for diagnosing flicker, double-fires, or off-by-one frame issues that aren't visible from a single point-in-time `debugSnapshot`.

  Also exposed on `__PIXI_REELS_DEBUG` after `enableDebug(reelSet)`:

  ```js
  __PIXI_REELS_DEBUG.startRecording("my-tag");
  await reelSet.spin();
  __PIXI_REELS_DEBUG.stopRecording();
  __PIXI_REELS_DEBUG.getFrames("my-tag");
  ```

  `startRecording` is idempotent per reel set — calling it twice on the same set replaces the prior session.

- [#95](https://github.com/schmooky/pixi-reels/pull/95) [`1abfc45`](https://github.com/schmooky/pixi-reels/commit/1abfc45a445ec9491ddee69367f827333735acdf) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `Reel.setSymbolAt(visibleRow, symbolId)` and `ReelSet.setSymbolAt(col, row, symbolId)` — public API for swapping a single visible cell's symbol identity in place at rest.

  Useful for live presentation effects that don't fit the `setResult` / `placeSymbols` flow:

  - converting a symbol to a wild after a cascade pop,
  - swapping to a sticky variant after a win is paid out.

  The method funnels into the same internal activate path as the rest of the engine, so the swapped-in symbol gets its proper parent (masked vs unmasked container), `zIndex`, and visual reset for free — no follow-up `refreshZIndex` required.

  Validation (all guards fail loud):

  - throws if the reel is in motion (`speed !== 0` or `isStopping`) — a mid-spin swap would be overwritten by the next wrap/stop frame anyway.
  - throws if `visibleRow` is not an integer in `[0, visibleRows)`.
  - throws if `symbolId` is not registered.
  - throws if the target row is a non-anchor cell of a big-symbol block.
  - throws if the target row currently holds the anchor of a big-symbol block — big blocks span multiple cells (and possibly reels) and require `placeSymbols` plus the cross-reel OCCUPIED coordinator.
  - throws if `symbolId` itself is a big symbol — same reason.
  - `ReelSet.setSymbolAt` additionally throws if the cell currently has an active pin; call `unpin(col, row)` first to overwrite.

  Emits `symbol:created` on the per-reel event bus, matching motion-driven swaps.

- [#78](https://github.com/schmooky/pixi-reels/pull/78) [`9f6f0da`](https://github.com/schmooky/pixi-reels/commit/9f6f0dac52bcb01936422e719db020c2e6b76280) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `reelSet.spin({ holdReels: [...] })` for subset spinning.

  Held reels skip START / SPIN / STOP entirely and stay on whatever symbols they're currently showing — no more "fragment the board into one ReelSet per column" workaround for Hold & Win, sticky / expanding wilds, or trigger-column bonus respins. Held reels count as already-landed for the `spin:allLanded` resolver, so only the non-held reels actually animate.

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
  - Big-symbol blocks crossing the held / non-held boundary are not supported — author results so big symbols stay inside a contiguous run of non-held reels.

  Exports `SpinOptions` from the package root.

- [#92](https://github.com/schmooky/pixi-reels/pull/92) [`aa8be14`](https://github.com/schmooky/pixi-reels/commit/aa8be149aa7c9f8ff4195b6850b767b8bf402bcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Make `SymbolData.unmask: true` actually re-parent the symbol view to `viewport.unmaskedContainer`.

  Until now the `unmask` flag on `SymbolData` was accepted by the builder but never read by the engine — symbols always landed inside the reel's masked container regardless of the flag. With this change, every code path that places a symbol into the reel — `_setupSymbolPositions`, `_replaceSymbol` (both stub-install and stub-replace branches and the regular swap), and `reshape` — consults `_symbolsData[id].unmask` and parents the view to `viewport.unmaskedContainer` when set.

  When unmasked, the engine sets the view's X to `reel.container.x` and adds `reel.container.y` to the view's Y so the at-rest cell position aligns with the reel column (since `unmaskedContainer` sits at viewport-local 0,0).

  Documented limitation in `SymbolData.unmask` JSDoc: `ReelMotion` writes `view.y` in reel-local coords every frame, so an unmasked symbol on the strip will appear shifted vertically by `reel.container.y` while the reel is spinning. Treat `unmask: true` as a _landed-state_ flag — it is correct at rest and during static frames, but not designed to stay visually accurate while the reel is spinning. For mid-spin "stays visible above mask" overlays, use a cell pin instead.

  **Pyramid layouts:** registering any unmasked symbol on a slot where any reel has a non-zero `offsetY` (pyramid / trapezoid) now throws at `build()`. Reason: the same motion-layer issue persists at landing — `snapToGrid` writes reel-local Y, mispositioning the unmasked view by `reel.container.y` even at rest. Use cell pins for above-mask overlays on pyramid slots, or remove the per-reel offset.

- [#104](https://github.com/schmooky/pixi-reels/pull/104) [`1dc8d08`](https://github.com/schmooky/pixi-reels/commit/1dc8d084ad171b8347312991c98cfbfc07bed451) Thanks [@feddorovich](https://github.com/feddorovich)! - `reelSet.spin()` accepts an optional `{ mode: 'standard' | 'cascade' }` argument that picks the phase chain for a single spin. Tumble-cascade slots can now do classic strip-spin + bounce on the first round and drop-in tumble on subsequent waves.

  `.cascade(...)` on the builder still wires the drop-in phases — but they are now registered under `dropStart` / `dropStop` keys instead of overwriting `start` / `stop`. The default mode flips to `'cascade'` when `.cascade(...)` was called, so existing callers that just call `spin()` without args see no change.

  Calling `spin({ mode: 'cascade' })` on a builder that didn't configure `.cascade(...)` throws a clear error. The new `SpinOptions` type is exported from the package barrel.

- [#103](https://github.com/schmooky/pixi-reels/pull/103) [`18474ee`](https://github.com/schmooky/pixi-reels/commit/18474eebbc0ed16b63f2e6b9f8af1acb9c5ea2d2) Thanks [@feddorovich](https://github.com/feddorovich)! - Added `ReelSet.requestSkip()` (and `SpinController.requestSkip()`) — a slam-stop entry point that's safe to call before `setResult()` arrives. If the result is already pending, it behaves exactly like `skip()`. Otherwise the skip is queued and fires automatically as soon as `setResult()` lands.

  Use this from UI handlers in server-driven slots: a player tapping the spin button to slam-stop before the WebSocket response reaches the client no longer snaps every reel onto whatever buffer state happened to be mid-scroll. Existing `skip()` is unchanged.

### Patch Changes

- [#93](https://github.com/schmooky/pixi-reels/pull/93) [`f111da8`](https://github.com/schmooky/pixi-reels/commit/f111da858ec0ca11a72ac389538b29f43f8c4262) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `Reel._replaceSymbol` now sets the canonical zIndex inline on every symbol activation.

  Previously the activate path set `view.zIndex = 0` and relied on a follow-up `refreshZIndex()` call to apply the real formula `(symbolData.zIndex ?? 0) * 100 + arrayIndex`. All current callers happen to call `refreshZIndex` after, but the contract was fragile: any future caller that swapped a single symbol via the activate path would see the wrong layering until the next motion-wrap.

  A new private helper `_computeSymbolZIndex(symbolId, index)` centralizes the formula and is used by both `refreshZIndex` (full rescan) and `_replaceSymbol` (single-symbol activate). OCCUPIED stubs receive `arrayIndex` directly, matching what `refreshZIndex` would assign.

  No public API change. The fix unblocks future single-symbol swap APIs (e.g. a public `setSymbolAt`) without forcing every caller to remember to `refreshZIndex` afterwards.

- [#97](https://github.com/schmooky/pixi-reels/pull/97) [`db32899`](https://github.com/schmooky/pixi-reels/commit/db32899c832ce68e7ba1aaf797bedaf3a85d6fa3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `ReelSetBuilder.bufferSymbols(count)` now clamps `0`, negative numbers, `NaN`, and non-finite values to the minimum of 1, with a single console warning per process.

  Buffer rows are off-screen cells the reel keeps around the visible window so symbols can fade/slide in cleanly. The motion layer's wrap detection assumes at least one buffer row above and one below — passing `0` would produce an inconsistent state that surfaced later as visible flicker on motion-wrap, not as a clear configuration error at build time.

  The clamp is preferred over a thrown error so existing user code that accidentally passed `0` keeps running. The warning fires once per process (regardless of how many builders hit the bad value) so logs stay readable when a faulty default is wired into a loop.

- [#94](https://github.com/schmooky/pixi-reels/pull/94) [`6a5c8d1`](https://github.com/schmooky/pixi-reels/commit/6a5c8d192025c0746cab311491b2984173c15d30) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `SpineReelSymbol` one-shot animation promises (`playWin` / `playLanding` / `playOut`) no longer dangle when the track is hijacked.

  Three previously-leaking scenarios now settle the returned promise instead of hanging forever:

  - **Concurrent one-shots** — calling `playOut()` while `playWin()` is in flight resolves the prior `playWin` promise (its track was overwritten) before starting the new one.
  - **`playBlur` mid-animation** — entering a SPIN that triggers blur while a win is still animating settles the win promise.
  - **Listener leak** — back-to-back one-shots no longer accumulate stale listeners on the Spine state. Each new one-shot detaches the prior listener.

  Refactored to a single internal `_resolveOneShot()` helper called from `onActivate`, `onDeactivate`, `stopAnimation`, `playBlur`, and the start of every new `_playOneShot`. The track-entry guard (`done !== entry`) is preserved so unrelated entries firing complete on the same track are correctly ignored.

  This unblocks reliable `await symbol.playWin()` patterns in win presenters and cascade orchestration.

- [#77](https://github.com/schmooky/pixi-reels/pull/77) [`265136a`](https://github.com/schmooky/pixi-reels/commit/265136a58cbcc4b289b6a070928345ca656c2cc1) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: stop reparenting recycled symbols on spotlight hide and always anchor `Reel._replaceSymbol` to its own container.

  Two related bugs caused symbols to render in the wrong reel after rapid spin/skip cycles, particularly when the win spotlight runs alongside an expanding-wild mechanic that triggers many `placeSymbols` calls in quick succession:

  - `SymbolSpotlight.hide()` reparented every symbol it had ever tracked back to its `originalParent`, even when `promoteAboveMask: false` (no reparenting on `show()`) or after the shared symbol pool had recycled the instance into a different reel. The recycled symbol got yanked from its new owner, leaving a hole there and a stranger in the original reel.
  - `Reel._replaceSymbol` used the captured `oldSymbol.view.parent` as the destination for the replacement view. If the old symbol had been moved (by the spotlight or by pool recycling), the new symbol landed in a foreign container — symbols accumulated in the wrong reel across spins.

  Both paths now anchor to the reel's own container; the spotlight only reparents symbols whose view is still in `spotlightContainer` (i.e., never recycled away).

- [#101](https://github.com/schmooky/pixi-reels/pull/101) [`7a7670c`](https://github.com/schmooky/pixi-reels/commit/7a7670cf1a98e2b2778069a728147452ece2dc66) Thanks [@feddorovich](https://github.com/feddorovich)! - `ReelSymbol.activate()` and `ReelSymbol.deactivate()` now both reset the container's `alpha`, `scale`, `rotation`, `filters`, and `zIndex`. Previously a subclass that decorated `view` from a spin-lifecycle hook (e.g. attaching a `BlurFilter` in `onReelSpinStart`) had to remember to undo every property on its own — and any path that skipped a hook (a buffer cell that exited spin without `onReelSpinEnd`, a slam-stop that bypassed the lifecycle) left a recycled symbol carrying stale state into its next life. The most visible symptom was a "blurred" cell appearing after a cascade refill once a symbol had been pooled mid-spin.

  `ReelSymbol.destroy()` now inlines the lifecycle hooks (`stopAnimation`, `onDeactivate`) instead of going through `deactivate()`, so it doesn't try to reset transform / filter state on a view that was already torn down by a parent `container.destroy({ children: true })`.

  The same-id early-return path inside `Reel._setSymbolAt` bypasses the deactivate/activate cycle, so the matching reset has been added there too.

  No public API change. Subclasses that already cleared their own filter / transform state continue to work and just do a few redundant assignments.

- [#102](https://github.com/schmooky/pixi-reels/pull/102) [`a2be4b8`](https://github.com/schmooky/pixi-reels/commit/a2be4b83544b66bd3650f14de251dcf51424b552) Thanks [@feddorovich](https://github.com/feddorovich)! - `SpinController.skip()` now fires `onReelSpinEnd` and `onReelLanded` on every reel that hadn't already landed, regardless of which phase was active when the slam-stop arrived. Previously these symbol-level hooks fired only when the active phase happened to be `StopPhase` or `DropStopPhase` (their `onSkip()` called the notifications); a skip during `StartPhase` / `SpinPhase` / `AnticipationPhase` / `AdjustPhase` left visible symbols without an end-of-spin signal — most visibly, motion blur (or any other decoration attached in `onReelSpinStart`) stayed on the cell after the slam.

  The notifications moved out of `StopPhase.onSkip` / `DropStopPhase.onSkip` into the controller so there's a single source of truth and no double-fire. Natural-stop flow is unchanged — those phases still fire the hooks themselves before the bounce.

## 0.3.2

### Patch Changes

- [`b86dad7`](https://github.com/schmooky/pixi-reels/commit/b86dad75fcdd4936170bb96a6084904bad419dd3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: ship `CONTRIBUTING.md` in the npm tarball so the npmjs.com "Contributing" sidebar link resolves. npmjs builds that link from `repository.directory` (`packages/pixi-reels`) and a standard filename, but the file previously only existed at the monorepo root — the link 404'd. The build script now syncs `CONTRIBUTING.md` into the package alongside `README.md` and `LICENSE`, and the package's `files` array includes it.

## 0.3.1

### Patch Changes

- [`93aa66c`](https://github.com/schmooky/pixi-reels/commit/93aa66c103ef0f624345c76a92a22621fc3c676a) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Update: package `homepage` now points at the canonical docs site, `https://pixi-reels.schmooky.dev`. No code or runtime change — npm metadata and the docs site URL only.

## 0.3.0

### Minor Changes

- [#61](https://github.com/schmooky/pixi-reels/pull/61) [`28551ca`](https://github.com/schmooky/pixi-reels/commit/28551ca72e6cbc1e95984cf1b35e71bdb5f18d22) Thanks [@schmooky](https://github.com/schmooky)! - Add: per-reel geometry, MultiWays, big symbols, and expanding wilds.

  - **Per-reel static shape (pyramids):** `builder.visibleRowsPerReel([3, 5, 5, 5, 3])`, optional `reelPixelHeights`, `reelAnchor: 'top' | 'center' | 'bottom'`. Reels can now have non-uniform row counts at build time.
  - **MultiWays (per-spin row variation):** `builder.multiways({ minRows, maxRows, reelPixelHeight })` plus `reelSet.setShape(rowsPerReel)` mid-spin. A new `AdjustPhase` (inserted only when `.multiways(...)` is called) reshapes reels between SPIN and STOP. Pin migration follows: pins gain a frozen `originRow` and migrate back toward it on each reshape.
  - **Big symbols (`N×M` blocks):** `register('bonus', SymbolClass, { size: { w: 2, h: 2 } })`. The result grid stays `string[][]` — the engine paints OCCUPIED across the block. `getSymbolFootprint(col, row)` resolves any cell to the anchor.
  - **Expanding wilds:** unchanged from the existing pin API; reaffirmed via tests as a degenerate big-symbol case.

  New events: `shape:changed`, `adjust:start`, `adjust:complete`, `pin:migrated`. They only fire on MultiWays slots — non-MultiWays event surfaces are unchanged.

  New runtime: `reelSet.setShape()`, `reelSet.getSymbolFootprint()`, `reelSet.getVisibleGrid()`, `reelSet.isMultiWaysSlot`. New builder fluents: `.visibleRowsPerReel()`, `.reelPixelHeights()`, `.reelAnchor()`, `.multiways()`, `.pinMigrationDuration()`, `.pinMigrationEase()`. Pin gains optional `originRow`.

  AdjustPhase animates the reshape: every visible symbol tweens its height + Y from the old shape to the new one over `pinMigrationDuration` ms with the configurable `pinMigrationEase`. Pin overlays tween in lock-step so a sticky wild visibly slides to its migrated row. Set `pinMigrationDuration(0)` for an instant snap.

  Constraints: big symbols and MultiWays are mutually exclusive per slot in v1. Cascade mode + MultiWays throws at build.

  **Breaking** (debug-only, not protected by semver but called out): `DebugSnapshot.visibleRows` widens from `number` to `number[]` so jagged shapes are representable. Adapt downstream code that deep-reads the snapshot.

### Patch Changes

- [#61](https://github.com/schmooky/pixi-reels/pull/61) [`4b22c00`](https://github.com/schmooky/pixi-reels/commit/4b22c00b0f5733d141de1fee4ed8bf515cc2a513) Thanks [@schmooky](https://github.com/schmooky)! - Fix and harden a handful of follow-ups from the per-reel-geometry / MultiWays / big-symbols PR:

  - `Reel.reshape()` now keeps `_reelHeight` in sync with the new geometry so the field doesn't go stale after a reshape. Previously a direct external call left `reelHeight` reporting the construction-time value. The method is also marked `@internal` in JSDoc — `ReelSet.setShape()` is the supported entry point.
  - `ReelSetBuilder.maskStrategy()` now validates its argument synchronously: passing `null`, `undefined`, or an object missing `build()` / `update()` methods throws with a grep-able error instead of crashing later inside `ReelViewport`.
  - Added a comment in `SpinController.skip()` documenting the reshape-on-skip contract — pin overlays migrate instantly on slam-stop regardless of `pinMigrationDuration`, and the rationale (overlays are destroyed at land anyway).

  No new public API; behaviour for existing well-formed callers is unchanged.

## 0.2.0

### Minor Changes

- [`3fd806a`](https://github.com/schmooky/pixi-reels/commit/3fd806a31d76be5fc6ac7ff8e23852814c542e1a) - Backfill for three engine PRs merged without changesets after `0.1.0`:

  - Cascade drop-in mechanic and anticipation recipe ([#51](https://github.com/schmooky/pixi-reels/issues/51)).
  - Engine primitives: `CellPin`, `movePin`, and `reelSet.frame` exposure ([#52](https://github.com/schmooky/pixi-reels/issues/52)).
  - `ReelSet.getCellBounds` for overlays, paylines, and hit areas ([#53](https://github.com/schmooky/pixi-reels/issues/53)).

  All three are additive, so this bundles them into a single minor bump.

- [`555c9f0`](https://github.com/schmooky/pixi-reels/commit/555c9f007d749a8e2329a53dc17208fc94d7b5f3) - Add: `WinPresenter` — a minimal win-presentation layer that animates winning cells and fires events. Paylines, cluster pops, scatter splashes all use the same shape. The library never draws lines or overlays; user code does that by reacting to events.

  - `WinPresenter.show(wins: Win[])` — animates each win's cells, one by one. `stagger: 0` flashes simultaneously, `stagger > 0` sweeps left-to-right in cell order.
  - `Win` — one shape: `{ cells: SymbolPosition[]; value?: number; kind?: string; id?: number }`. Covers paylines, clusters, cascade pops, scatters.
  - `dimLosers` (default 0.35 alpha) fades non-winning cells during each win; restored on `win:end`.
  - `symbolAnim`: `'win'` (default, calls `playWin()`), a named spine animation, or `(symbol, cell, win) => Promise<void>` for a custom callback.
  - Events fire on `ReelSet.events`: `win:start` (full list), `win:group` (per-win), `win:symbol` (per-cell), `win:end` (`complete` / `aborted`). Subscribe with `reelSet.getCellBounds` to draw any overlay you want.
  - Cascades: call `presenter.show([{ cells: winners }])` from `runCascade`'s `onWinnersVanish` hook — same API.
  - Helper: `sortByValueDesc` exported for convenience.
  - Types: `Win`, `SymbolPosition` (canonicalised to `config/types`, re-exported from events).
  - Reels now have an explicit `container.zIndex = reelIndex` so the viewport's sorted `maskedContainer` draws reels deterministically — same order as before, but callers can flip it for bottom-left diagonal overflow.

  No existing API is changed or removed.

### Patch Changes

- [`7792142`](https://github.com/schmooky/pixi-reels/commit/779214217bb341cfb66f2db74616b2e8608893b9) - Fix: Two `AnimatedSpriteSymbol` bugs that only manifest on symbols with non-trivial win animations:

  - `resize()` now positions the sprite according to its configured anchor, so `anchor: { x: 0.5, y: 0.5 }` renders the symbol centred in its cell instead of with its centre pinned to the cell's top-left corner (which clipped three quarters of the symbol under the reel mask). `anchor: (0, 0)` — the prior default and only combination that worked — is unchanged.
  - `playWin()` now returns the animation to frame 0 (`gotoAndStop(0)`) when the sequence completes, so the idle visible state settles on the neutral base frame. Previously the sprite held its last animation frame indefinitely — fine for symmetric pulses that happen to end where they started, a visible glitch for anything else (AI-generated or keyframe sequences that end mid-action).
