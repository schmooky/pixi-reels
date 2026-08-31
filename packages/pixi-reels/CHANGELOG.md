# pixi-reels

## 2.4.0

### Minor Changes

- [#215](https://github.com/schmooky/pixi-reels/pull/215) [`002ded2`](https://github.com/schmooky/pixi-reels/commit/002ded279aaf106d6f21050a81108ec30cfb683b) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix and sharpen shaped anticipation, following review of the feature above.

  **Fix: a `curve` no longer scrolls a cascade reel.** A tumble reel has already
  dropped its visible symbols and must tease at rest; the guard that pinned this
  only covered the legacy tease, so a `curve` dragged buffer symbols back through
  the empty window. `curve` / `cells` are now dropped in cascade mode with a
  notice naming the reel.

  **Fix: a travel anchor no longer deletes the legs before the last one.**
  `cells` measured from the start of the tease, so a fast opening segment could
  reach the target before the segments after it ever played — silently. The anchor
  now applies to the final leg, which is what the docs always described.

  **Fix: curve segments are validated at the call.** A negative `speed`, a
  non-positive `duration`, a negative `hold` or a `NaN` were all accepted and
  played. The function form is now resolved (and validated) for every teasing reel
  when `setAnticipation` is called, so a bad curve throws next to the caller's own
  stack instead of being swallowed by the reel task.

  **Fix: drive bounds are profile-relative.** `motionModel('drive', { accelFrames:
20 })` means "reach the ACTIVE profile's full spin speed in 20 frames" and
  re-resolves per spin. The absolute `accel` form only suited a single-profile
  game: with `spinSpeed` 30 / 50 / 80 across the presets, one fixed bound made
  SuperTurbo take 53 frames to reach speed where Normal took 20. Mixing the two
  forms throws. A drive that cannot meet a segment's time budget now says so.

  **Fix: `composeMasks` no longer accumulates scene nodes.** A member that owns
  its own Graphics — including any strategy wrapped in `inset(...)` — added a
  fresh child on every redraw, so each viewport resize and MultiWays reshape
  leaked a node.

  **Fix: the new mask warnings go through the notice channel**, so they carry a
  code and obey `setLogLevel('silent')` like every other notice.

  Add: `anticipation:segment` fires once per curve leg (`{ reelIndex, index,
total, speed, targetSpeed }`), so tease audio can hit the surge and the crawl
  separately instead of polling the speed to find the boundary. `cells` takes the
  same function-of-tease-order form as `curve`. `stepDrive` writes into the state
  it is given rather than allocating one per reel per frame, and a parked drive is
  no longer stepped at all.

- [#215](https://github.com/schmooky/pixi-reels/pull/215) [`002ded2`](https://github.com/schmooky/pixi-reels/commit/002ded279aaf106d6f21050a81108ec30cfb683b) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `reelSet.setReelGroups([[0, 1], [2, 3], [4]])` — reels stop and skip as
  blocks instead of individually.

  Reel index was the engine's only ordering, which breaks as soon as a reel's job
  is not tied to its neighbours. A filler reel meant to outlast a tease on the
  reels before it landed in the middle of that tease instead, because its flat
  `reelIndex * stopDelay` offset came due while they were still teasing, and a
  skip press landed "everything outside the tease" — including that filler reel —
  in one go.

  A group is a barrier in both directions. **Stopping:** no reel in a group starts
  its stop sequence (anticipation included) until every reel in the earlier groups
  has landed, and a reel waiting its turn keeps spinning at full speed, so the
  wait reads as "still going" rather than as a pause. **Skipping:** a press
  releases the next un-landed group, with tease protection still applying inside
  it — `protect: 'stepwise'` brings a group of teasing reels down one press at a
  time, in tease order.

  Stop delays become group-relative, so the profile's `stopDelay` staggers reels
  within a group rather than re-adding a whole-board offset on top of the barrier.
  An explicit `setStopDelays()` is still taken as given. Every reel must be listed
  exactly once; `null` clears. Sticky across spins, like `setStopDelays()`.

  Sets that never call it are unaffected.

- [#215](https://github.com/schmooky/pixi-reels/pull/215) [`002ded2`](https://github.com/schmooky/pixi-reels/commit/002ded279aaf106d6f21050a81108ec30cfb683b) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: mask primitives beyond the rectangle, and anticipation you can shape.

  **Masks.** `RoundedRectMaskStrategy` rounds the whole grid (`scope: 'set'`) or
  each reel as its own card (`scope: 'reel'`). `SilhouetteMaskStrategy` rounds the
  outline of a jagged pyramid / MultiWays set — every step of the staircase,
  concave corners included, with their own radius — instead of forcing you to pick
  between notched seams and a bounding box that hides the shape.
  `PathMaskStrategy` takes a `(graphics, context) => void` so a one-off custom
  mask no longer needs a class. `inset(strategy, px)` shrinks any strategy's
  output; `composeMasks(...)` unions several into one mask.

  **Fix:** `RectMaskStrategy` ignored `ctx.bleed`, so a warped set combining
  `curveBleed(...)` with an explicit `.maskStrategy(new RectMaskStrategy())` clipped
  the very overhang the bleed asked for.

  **Anticipation.** `setAnticipation(reels, { curve })` replaces the fixed
  decelerate-then-hold with explicit speed legs, so a tease can surge above spin
  speed before it crawls, and its transitions ramp instead of stepping (segment
  eases default to `power2.inOut`). Pass a function of tease order to vary the
  curve per reel. `{ cells: n }` ends a tease after N symbols of travel instead of
  after a fixed time. `reel.speedNormalized` exposes live speed as a fraction of
  spin speed, for tease audio that tracks the slow-down rather than just its
  start and end.

  **`motionModel('drive', { accel, decel, jerk })`** opts a set into
  acceleration-bounded motion: phases set a target speed and the reel integrates
  toward it, so every transition is shaped by the bounds instead of by a
  per-transition ease, and a mid-move retarget stays continuous. Opt-in; the
  default `'tween'` model is unchanged.

  Existing spins are byte-for-byte unaffected: the new eases and the drive apply
  only where you ask for them.

- [#215](https://github.com/schmooky/pixi-reels/pull/215) [`002ded2`](https://github.com/schmooky/pixi-reels/commit/002ded279aaf106d6f21050a81108ec30cfb683b) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `ReelSymbol.playIn()` / `playOut()`, and `reelSet.swapSymbols(...)` — the
  mystery-reveal and upgrade beat as one call.

  `setSymbolAt` already swapped an identity, but instantly. A game that wants "the
  cells dissolve, the symbol underneath changes, the reveal arrives" had to
  hand-roll the ordering, the stagger, the zIndex bump so an overshooting entrance
  is not clipped, the re-hide after the swap (re-activation resets the view to
  fully visible, so the new art popped for a frame before its entrance began), and
  the abort handling — every time.

  `playIn` / `playOut` are the symbol-level hooks, with the same contract as
  `playDestroy`: `delay`, `signal`, resolve when done, abort means "snap to the
  end" rather than "fail". Defaults are a short scale-and-fade; override them for
  a Spine `in` / `out` track. They are separate from `playDestroy`, which stays
  tuned as the cascade's "this cell was a winner and is being consumed" poof.

  `swapSymbols(cells, opts)` orchestrates the three beats — out, swap, in — with
  per-cell `outDelay` / `inDelay` staggers, a `holdMs` and an `onSwapped` hook for
  the beat while the board is dark, and `skipOut` / `skipIn` for art that drives
  one side itself. Cells are validated up front, and an abort still performs the
  swap, so the board never disagrees with the result the server sent.

  Single-cell symbols only: a big symbol spans cells the frame layer has to
  reserve, so revealing one remains a `setResult` / `setShape` job.

### Patch Changes

- [#215](https://github.com/schmooky/pixi-reels/pull/215) [`002ded2`](https://github.com/schmooky/pixi-reels/commit/002ded279aaf106d6f21050a81108ec30cfb683b) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - `setReelGroups()` now documents and enforces its window. A layout may be set any
  time up to `setResult()` — including between `spin()` and `setResult()`, so a
  round can be grouped from its own server response; the barrier is read as each
  reel's SpinPhase resolves, which is exactly when the result lands. Changing the
  layout once reels have begun landing throws instead of half-applying: a reel that
  already passed the barrier cannot un-pass it, so the new layout would apply to
  some reels and not others, silently.

## 2.3.0

### Minor Changes

- [#213](https://github.com/schmooky/pixi-reels/pull/213) [`600ad7d`](https://github.com/schmooky/pixi-reels/commit/600ad7db888ec00cddea17a51dad9b2de3733ca1) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: one console channel for everything the library says. Every warning and error now carries a stable CODE you can grep for, looks the same in the console, and obeys one volume knob via the new `setLogLevel(level)` / `getLogLevel()` (`'silent' | 'error' | 'warn' | 'info'`, default `'info'`). Before this, ten call sites hand-rolled their own `[pixi-reels] ...` string - one had no prefix at all - and there was no way to quieten them in a production build.

  In a browser each notice prints as a styled badge (`pixi-reels` pill, then the code, then the message); everywhere else it degrades to `[pixi-reels] warn(code) message`, because `%c` is a browser console feature and Node prints the directives literally. Notices keep going through `console.warn` / `console.error` / `console.info` rather than a single `console.log`, so devtools filtering, stack capture and the browser's own warn/error styling all keep working, and detail arguments are passed through untouched so an `Error` keeps its stack.

  Fix: `slamStop()` called before `setResult()` now says so. There is nothing to land on in that window, so the reels stop wherever the strip happens to be - random buffer fill in standard mode, and the alpha-0 residue of the fall-out in cascade mode, i.e. an invisible board. Nothing reported it; the reels just sat there showing the wrong thing. It stays a warning rather than a throw because `slamStop()` is the unconditional exit the engine's own abort, timeout and error-recovery paths depend on, and those legitimately fire before a result - `skipSpin()` is the guarded entry point and still throws in this window.

  The default level is `'info'` rather than `'warn'` on purpose: the mask-strategy auto-pick notices this replaced were unconditional, and anything lower would have silently deleted advice the engine used to give.

- [#213](https://github.com/schmooky/pixi-reels/pull/213) [`600ad7d`](https://github.com/schmooky/pixi-reels/commit/600ad7db888ec00cddea17a51dad9b2de3733ca1) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: skip granularity. Skip used to be all-or-nothing. `skipSpin()` / `requestSkip()` / `slamStop()` force-completed every reel's phase, `AnticipationPhase` included, so a press on a teasing spin ended the tease before the player ever saw it. Three levers now open that up, plus the phase classes needed to build your own.

  **`setAnticipation(reels, { protect })`** guarantees the tease becomes visible before a press can end it. `'once'` (or `true`) makes the first press of the round land every NON-tease reel immediately and leave the tease reels running, so the trigger symbols are on screen and the build-up is under way; the next press ends it. `'stepwise'` then releases the NEXT tease reel on each press after that, in tease order (tease order, not reel index), so the player walks the tension forward one reel at a time and the press that releases the last one is the round-ending press. `'always'` never lets a press end a tease. For any other grouping, pair `'always'` with your own `slamStop({ reels })` per press: protection keeps a press from ending a tease, and game code decides which group each press lands. `skipStage` reports `1` in that in-between state, which is what a UI should keep the button live on - gate on `isSpinning` first, since the stage is round-scoped and only resets on the next `spin()`, so an `'always'` round (which never reaches `2`) ends parked at `1`. Protection applies to `skipSpin()` and `requestSkip()` (including a press queued before `setResult()` arrived - call `setAnticipation` BEFORE `setResult` so the queued press can see the tease). Bare `slamStop()` stays an unconditional land-now. Protection is inert when the effective hold is `0` ms, as in Turbo / SuperTurbo without a `duration` override: there is no tease to protect, so every press lands everything.

  **`slamStop({ reels })` / `slamStop({ except })`** is a per-reel slam. Those reels land now and every other reel keeps running its phase chain to a natural landing. It is the raw lever under `protect`, exposed so a game can express its own rule. A partial slam does not touch `skipStage` and does not end the round; a partial slam with nothing left to land is a no-op rather than a skip.

  **`setMinimumSpinTime(ms | ms[])`** overrides the `SpinPhase` floor per reel. `minimumSpinTime` lives on the speed profile, so it is one value shared by every reel, and `setStopDelays()` - the only other per-reel lever - cannot go under it. The two missed each other: instant was only ever global, and per-reel could not go below the floor. Persists across `spin()` / `refill()` until cleared with `null`, matching `setStopDelays()`.

  There is a fairness reason to prefer `protect` over raising the floor on teasing spins. If a scatterless skip lands instantly but a teasing skip settles at the floor, the response time itself tells the player a feature is coming before the reels have landed. `protect` keeps the non-tease reels landing at the same instant either way and puts the tell on screen where it belongs.

  `skip:requested` and `skip:completed` now carry `{ reels, partial }` so a listener can tell a partial slam from a round-ending one. Listeners written against the old zero-argument signature keep working.

  **The built-in phase classes are exported**: `StartPhase`, `SpinPhase`, `StopPhase`, `AnticipationPhase`, `AdjustPhase`, `CascadeFallPhase`, `CascadePlacePhase`, `CascadeDropInPhase`. `SpinPhaseConfig.minimumSpinTime` documented an override that could not be reached, because registering a phase through `PhaseFactory` meant reimplementing it rather than subclassing it. Now `class MyStop extends StopPhase` and register it. `resolveTumbleConfig` is exported alongside them: the three cascade phases take build-time config as extra constructor arguments, and a subclass registered through `registerFactory` has to forward the same resolved shape `.tumble()` would have passed. These are engine internals: the protected surface (`onEnter` / `onSkip` / `update` and each phase's private staging) can shift in a minor release, so a subclass may need to follow. The config TYPES remain the stable part.

  Fix: a `.phases(...)` override of a cascade or MultiWays phase was silently discarded. `phases()` applied its configurator at call time, while `.tumble()` and `.multiways()` register their defaults later, inside `build()`, so any `'cascade:fall'` / `'cascade:place'` / `'cascade:dropIn'` / `'adjust'` registration was overwritten with no error - and the builder's own doc comment advised calling `.phases(...)` after `.tumble(...)`, which could not help, because chain position was never what decided the winner. Configurators are now deferred to the end of `build()`'s phase wiring, so an override wins from anywhere in the chain and the last override of a key wins.

  `spin:allStarted` is now announced from a single place rather than only by a reel entering SPIN, so a partial slam that lands every reel still waiting to start no longer swallows it. It still fires at most once per round.

  Internally, a partial slam cannot use the spin generation as its abort switch - that is global, and bumping it would strand the surviving reels mid-chain - so slammed indices are tracked per reel and each chain checks them at its own await boundaries. A full slam behaves exactly as before.

### Patch Changes

- [#213](https://github.com/schmooky/pixi-reels/pull/213) [`600ad7d`](https://github.com/schmooky/pixi-reels/commit/600ad7db888ec00cddea17a51dad9b2de3733ca1) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: a reel that teased during a tumble spin never came to rest. `AnticipationPhase` tweens `reel.speed` UP, and the tumble stop path never brings it back down - `cascade:place` swaps symbol identities and `cascade:dropIn` tweens views, and neither touches `reel.speed` the way `StopPhase._landAndBounce` does. So in any cascade game calling `setAnticipation()`, every teasing reel was left running at the tease speed after the round ended, drifting further off-grid every frame for the rest of the session while the untouched reels stayed put.

  Two changes. A tumble tease is now a pure hold: the reel has already dropped its visible symbols and is sitting at zero, so scrolling it would drag buffer symbols back through the empty window, and the multiplier is pinned to `0` there whatever the `slowdown` curve says. And a tumble reel is brought to rest and snapped to the grid before the place phase, which holds the invariant even when a custom `'anticipation'` phase is registered and does move the reel.

  Strip spins are unaffected: `StopPhase` was always resting the reel there, which is why this only ever showed up in cascades.

## 2.2.1

### Patch Changes

- [#209](https://github.com/schmooky/pixi-reels/pull/209) [`8b6517c`](https://github.com/schmooky/pixi-reels/commit/8b6517ca572d58d655c7f2debc4242b147a58ac6) Thanks [@caesar-v](https://github.com/caesar-v)! - Reset the symbol's animation pose on a same-id refill. Reusing the instance without `deactivate()`/`activate()` left it parked on the final frame of its last one-shot win, so a refilled cell could hold a symbol and draw nothing.

## 2.2.0

### Minor Changes

- [#203](https://github.com/schmooky/pixi-reels/pull/203) [`6012925`](https://github.com/schmooky/pixi-reels/commit/60129257d46fec94be9af21669afeac1c41f6898) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: reel curvature. `builder.curve(0.45)` projects the set onto a drum, `builder.curvePerReel([...])` gives each reel its own camera, and `reelSet.setCurve(...)` re-projects at runtime for tuning. `amount` is how far round the drum the window sees; `depth` is how strong the perspective is, capped below the angle at which cells would fold back over each other. A set with no `curve()` builds no curve object and is unchanged.

  **The cell facing the camera is drawn at 1:1** - authored size, both axes, no keystone - and everything else bends around it. That has a consequence worth planning for: a drum whose middle is 1:1 cannot also reach the window edges. Its ends fall short, the buffer cells fill that band compressed as they curve away, and you frame or mask it the way a real cabinet's bezel does. Normalizing to the window edges instead would magnify the main axis at the centre while leaving the cross axis alone, i.e. a visibly stretched middle row.

  **Two ways to draw it.**

  `curveMode('symbol')` (default) projects each cell on its own - crisp, free, and a real keystone, but only for content that IS a texture, because a `Container` transform is affine. The engine hands each symbol a projected quad through the new `ReelSymbol.applyCellQuad()`; `SpriteSymbol` and `AnimatedSpriteSymbol` draw it through a PixiJS `PerspectiveMesh` at no extra render pass. Everything else (Spine, `Graphics`, composite subtrees) takes the closest affine fit: a UNIFORM scale sized to fit inside the projected footprint, so art is never distorted along one axis and no cell overlaps its neighbour. `PerspectiveCell` and `canProjectTexture()` are exported for custom texture-backed symbols.

  `curveMode('warp')` + `renderer(app.renderer)` bends the whole reel instead - each reel is rendered to a texture and drawn through a mesh whose VERTICES are displaced by the projection. Spine, atlas art, text and composites all bend, no symbol cooperates, and because the bend is on the rendered reel rather than in each cell, the spin, the stop bounce and cascade falls travel ALONG the curve instead of translating flat. Costs one render pass per reel per frame plus one resample; `build()` throws without a renderer.

  KNOWN LIMITATION (`'symbol'` mode only): an ATLAS sub-frame does not take the mesh path. The mesh addresses its source with plain 0..1 UVs and remapping them onto the frame has not produced a correct draw, so `canProjectTexture()` refuses those and the symbol takes the affine fit - correct, but not keystoned. That is most production art. `'warp'` has no such limit, since a render texture owns its whole source.

  `builder.curveFocus('reel' | 'set-lean' | 'set')` picks where the camera stands across the strip: one per reel (default, five separate drums), one on the middle of the board (receding cells lean IN and the grid reads as one wide cylinder), or halfway. Anything but `'reel'` auto-selects `SharedRectMaskStrategy`, since the lean crosses each reel's own column.

  `builder.curveBleed(px)` gives the warp texture room across the strip for art wider than its cell - an overflowing mystery or scatter plate - so the overhang is captured, warped with everything else, and hangs over its neighbours instead of being sliced at the texture edge. `MaskContext` gains a matching `bleed` so `SharedRectMaskStrategy` stops clipping it back to the board, which mattered most at the outermost reels where the overhang leaves the board entirely. Defaults to `0`; the field is read defensively so a `MaskContext` built before it existed still yields a valid mask.

  `ReelSet.getCellQuad(reel, cell)` returns the four corners a curved cell is actually drawn on, or `null` when flat - `getCellBounds()` has to return a rectangle and widens to the trapezoid's bounding box. Outline with the quad, hit-test with the box. The debug overlay's `cells` and `buffers` layers use it, so the overlay shows the projection rather than a box around it.

  Art that does not fill its cell reports its real footprint through the new `ReelSymbol.cellInset`, derived automatically from an atlas frame's trim, so a small symbol is projected where it actually sits instead of being inflated to the cell's edges.

  The projection never touches a view's `position`, so landing, wrapping, cascades, big symbols and MultiWays reshapes are unaffected.

  Also fixes `ReelSymbol.playDestroy()` compensating its pivot move by the raw offset instead of the offset times scale, which made a scaled symbol jump on the first frame of the destroy animation.

## 2.1.0

### Minor Changes

- [#204](https://github.com/schmooky/pixi-reels/pull/204) [`9f10dd5`](https://github.com/schmooky/pixi-reels/commit/9f10dd59cc2116957a0d77d944179b382ecb0809) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: symbol pools. `builder.randomSymbols(pool, scope)` and the runtime `reelSet.randomSymbols` decide what the engine may draw for cells the game does not name. A pool is `{ weights?, exclude? }`; its scope is `{ reel?, slots?: 'spinning' | 'buffer' }`.

  Until now `weights()` was one table for the whole set, and the only levers past it. `setExcludeSpinning` / `setExcludeBuffer` on `RandomSymbolProvider` were unreachable from a built set (the provider is deliberately not exported, and `Reel` keeps its reference private), so "keep this symbol out of the buffer cells" meant writing a `FrameMiddleware`. Two things games actually ask for now have a call:

  ```ts
  // A coin may blur past mid-spin, but must never park half-visible
  // above or below the grid.
  reelSet.randomSymbols.set({ exclude: ["COIN"] }, { slots: "buffer" });

  // Reel 2 runs hot on wilds for the feature, then back to the base table.
  reelSet.randomSymbols.set({ weights: { WILD: 40 } }, { reel: 2 });
  reelSet.randomSymbols.set(null, { reel: 2 });
  ```

  The two ends of the strip can be governed separately: `slots` takes `'bufferStart'` and `'bufferEnd'` as well as `'buffer'` (both) and `'spinning'` (everything). `bufferStart` is the side at the smaller main coordinate - above on a vertical set, left on a horizontal one - the same end `ColumnTarget.bufferStart` addresses, whichever way the reel travels.

  ```ts
  // Nothing peeks in from above; the cell below the grid is left alone.
  reelSet.randomSymbols.set({ exclude: ["COIN"] }, { slots: "bufferStart" });
  // ...on one reel only.
  reelSet.randomSymbols.set(
    { exclude: ["COIN"] },
    { reel: 2, slots: "bufferEnd" }
  );
  ```

  Layers resolve base weights -> global spinning -> per-reel spinning -> global buffer -> per-reel buffer -> global side -> per-reel side. Weights override per symbol id, exclusions accumulate, and a narrower layer can never re-admit what a wider one banned. A weight of `0` bans a symbol as surely as `exclude` does, in a pool and in `weights()` alike. Pools govern the RANDOM draw only. an explicit `setResult` / `initialFrame` target is the game speaking and always wins. `weights(scope?)` reports the effective table, so a game can assert its own configuration in a test; ask for `'buffer'` to see what both sides inherit, or for a side to see exactly what it draws from.

  Two failure modes now fail loud instead of quietly doing nothing: naming an unregistered symbol id in a pool throws (with the registered ids listed), and a pool that leaves some reachable scope with nothing to draw throws at the call that caused it, naming the scope, rather than mid-spin on whichever reel wraps first. The rejected pool is not installed. `setExcludeSpinning` / `setExcludeBuffer` keep working as sugar over the global spinning / buffer pools.

  `Reel.placeStrip` now random-fills each empty slot from the pool that slot belongs to. it used to apply the buffer rules to visible cells too, which mattered the moment "buffer" stopped meaning "everything a skip places".

### Patch Changes

- [#204](https://github.com/schmooky/pixi-reels/pull/204) [`9f10dd5`](https://github.com/schmooky/pixi-reels/commit/9f10dd59cc2116957a0d77d944179b382ecb0809) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: an `unmask: true` symbol in a BUFFER cell no longer renders above the mask, where it hung outside the grid in plain sight.

  `unmask` lifts a view out of the reel's masked container. That is an at-rest presentation for a cell the player is looking at, and `notifyLanded()` has always lifted visible cells only. But the lift decision itself was made from the symbol id alone, so any at-rest write to a buffer slot lifted it as well. and a buffer slot is parked outside the window precisely because the mask should hide it.

  The path that showed it in a real game was a skip. `StopPhase.onSkip` lands the full strip (buffers included) through `placeStrip`, so a skip taken once the bounce has started. i.e. after `notifyLanded()` put the reel back at rest. lifted every unmask symbol the target frame had in `bufferStart` / `bufferEnd`, and they stayed up there until the next spin pulled them back down. `Reel.reshape` growing a strip at rest did the same to its new tail cells.

  The lift now takes the slot into account, so a buffer cell never lifts. A second case needed the reverse: a symbol lifted while it was VISIBLE can still travel into a buffer slot without being replaced. a nudge rotates the array and only the wrapped symbol goes through `_replaceSymbol`, so an unmask symbol nudged out of the window kept its seat above the mask. Every settle now re-masks any lifted view that ended up outside the window.

## 2.0.0

### Major Changes

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: three public members no longer re-expose classes the package deliberately hides, and `HoldAndWinBoardConfig` is now exported.

  `RandomSymbolProvider`, `StopSequencer` and `ReelMotion` were hidden from the package entry in 1.0.0 (PR [#140](https://github.com/schmooky/pixi-reels/issues/140)). Three public members were still typed with them -- `Reel.motion`, `Reel.stopSequencer`, `FrameBuilder.randomProvider` -- which put those classes back into `dist/core/Reel.d.ts` and would have semver-locked them into all of 2.x. All three are now `@internal`, so `stripInternal` keeps them out of the published types. Nothing is lost: reel geometry is on `ReelSet.getCellBounds()` / `getBlockBounds()` and `Reel.cellMain` / `.extent` / `.mainOffset`, landing is driven by `setResult()` / `slamStop()`, and symbol weights are configured via `builder.weights({...})`.

  `HoldAndWinBoardConfig` is now exported. The board's own export block promises that a fork can "copy HoldAndWinBoard + HoldAndWinState, repoint their imports at `pixi-reels`, and everything they reach for is public" -- but the config the constructor takes was not, so the first line of a forked board could not be typed.

  A new `check:api-surface` guard fails the build on any public member typed with a `src/` type no entry point exports, so this cannot silently regress. Constructor parameters are reported separately and waived by name: tagging a constructor `@internal` strips the whole signature and leaves consumers an implicit zero-arg `new Reel()` that typechecks and then throws, which is worse than the leak.

  Fix: `destroySymbols()` now names the reel and cell when a visible cell has no symbol. The coordinate range check already passed at that point, so a miss means the strip is short or holed -- a reel torn down or reshaped while a cascade was in flight. It previously surfaced as `Cannot read properties of undefined (reading 'view')` from inside an `Array.map`, naming neither the cell nor the reel.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: cascade grids are validated, the debug snapshot follows the travel axis, and `Gsap` is exportable.

  **`refill()` and `runCascade()`'s `nextGrid` now validate their grid**, the same way `setResult()` always has: shape, v1 option keys, and buffer counts that fit the reels. They previously validated nothing, so a cascade grid still carrying a v1 `bufferAbove` reached `columnTargetToStrip`, came back `undefined`, and was silently random-filled on every stage of the chain -- the exact silent divergence the fail-loud guards exist to prevent. A `string[][]` grid threw a bare `TypeError` deep in the pipeline instead of naming the call. Errors name their own entry point, so a bad `nextGrid` says `runCascade(): nextGrid` rather than surfacing as a `refill()` failure two frames later.

  The buffer-overflow message now reads `setResult()` rather than `setResult`, matching every other message from that call.

  **`DebugReelSnapshot.allSymbols[].y` is now `.main`**, the coordinate along that reel's travel axis, and each reel reports its `orientation` and `direction`. The old field was hard-coded to `view.y`, so on a horizontal set every symbol reported a constant `0` -- no positional information at all, in the one orientation 2.0 exists to add. This is the surface agents are pointed at precisely because the canvas is opaque to them.

  **`Gsap` is exported.** It is the second parameter of `driveGsapWithTicker`, the type of `ReelConfig.gsap`, and the return type of the `Reel.gsap` accessor, but it could not be named by a consumer.

  **The v1 rename tables are no longer exported.** `CODEMOD_HINT`, `V1_BUILDER_METHODS`, `V1_OPTION_KEYS` and `V1_OPTION_VALUES` were public, which would have semver-locked 1.x migration scaffolding into all of 2.x. The guards still read them internally and every throw still names the replacement; nothing a consumer writes needs the table.

  Fix: a `nudge()` on a jagged layout no longer displaces symbols that render above the mask. `ReelMotion.advance()` derives positions from the array index and writes them absolutely (it accumulated with `+=` in 1.x), which dropped the reel offset baked into any view lifted into `viewport.unmaskedContainer`. A nudge is the one path that moves the strip while the reel is at rest, so an `unmask: true` symbol on a pyramid reel jumped a full cell out of its column for the whole tween and snapped back at the end.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove: the `examples/` directory. The standalone demo apps now live in a separate repo.

  Nothing in the published package changes -- `examples/` was never part of the tarball. This matters only if you cloned the repo to run a demo. Runnable demos live on the docs site under `/recipes`, about 130 of them, each with its source alongside; `pnpm site:dev` serves the whole set.

  Keeping two parallel demo surfaces in one repo meant every API change had to be made twice, and the example half kept losing: two of the six apps were still passing `string[][]` to `runCascade`'s `nextGrid`, which throws on the first cascade, and nothing caught it because `vite build` only transpiles.

  What survived the move, for anyone following a path from an older doc:

  - `examples/shared/` symbol classes and asset loaders are now `apps/site/src/runtime/`
  - `CheatEngine` and `SeededRng` are the private `@pixi-reels/cheats` package (still outside the library, per ADR 009)
  - the prototype sprite atlas is `apps/site/public/prototype-symbols/`
  - `examples/orientation-matrix` is `tests/e2e/fixtures/orientation-matrix`, unchanged in what it proves: browser coverage of all four orientation x direction combinations

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove: `ReelAxis.withDirection()`, and with it the last trace of a per-spin direction override that never shipped.

  The method had **zero call sites in `src`**. It existed only to serve ADR 016 section 3.5's `spin({ direction })` / `spin({ directionPerReel })`, which is not implemented and is absent from `SpinOptions`. Shipping it would have frozen a method into all of 2.x whose only justification was an unbuilt feature -- the same trap as exporting the v1 rename tables.

  Direction is fixed at `build()`: `.direction(d)` and `.directionPerReel([...])`. Nothing else changes. The engine constructs one axis per reel via `reelAxis(orientation, direction)` and has never needed a sibling; if you were calling `withDirection` yourself, call `reelAxis(axis.orientation, d)` instead.

  Implementing the per-spin override is a feature PR after 2.0, not a freeze rider: `Reel._axis` is `readonly` and is handed to `ReelMotion`, `ReelViewport`, and every phase at construction, so a per-spin flip needs a re-injection path through all of them, plus the mid-spin-throw guard and the section 3.4 "both buffers >= 1" validation that only per-spin overrides force. Re-adding the method then is additive -- consumers receive axes, they do not implement the interface. ADR 016 records this as decision 4 under Status, so it does not get re-proposed from the design doc.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Change: `string[][]` is no longer accepted anywhere as a grid input. `runCascade`'s `nextGrid` must return `ColumnTarget[]`, and the `pixi-reels/testing` helper `spinAndLand` takes `ColumnTarget[]` too -- its `string[][]` convenience form is gone. Wrap with `grid.map((visible) => ({ visible }))`.

  One accepted shape means a grid read out of the engine can be handed back to it without a conversion step, and a wrong shape now names itself at the call site instead of failing later inside the frame pipeline.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: an `unmask: true` symbol now travels with the reel through the stop bounce instead of hanging still for it.

  `StopPhase` lifts landed unmask views into `viewport.unmaskedContainer` in `notifyLanded()` and only then tweens `reel.container` through the two-leg overshoot. A lifted view carries the reel offset in its own coordinate rather than inheriting it from a parent, so it did not follow that tween: on the default profile a landed scatter or wild sat motionless for the full 600 ms while the rest of the reel bounced underneath it. The bounce now keeps lifted views pinned to the reel for every frame, and settles them on the exact resting position rather than the last tween sample.

  Skipping mid-bounce had the same fault from the other side. `onSkip()` snapped to grid _before_ resting the container, so `snapToGrid` baked the current overshoot position into every lifted view and the container then moved out from under it -- leaving the view off by however far the bounce had travelled. The container is rested first now.

  Fix: `nudge({ startDelay })` no longer leaks an `abort` listener per call. The listener was registered with `{ once: true }`, which only self-removes when the event actually fires, so every nudge that completed normally left one behind. The documented staggered pattern -- one long-lived `AbortController` across `Promise.all(reels.map(...))` -- accumulated them for the life of the controller. It is now removed on both paths.

  Fix: `StopSequencer.next()` throws when the frame is exhausted instead of returning `_frame[0]`, or `''` after a `reset()`. Both fallbacks handed back a symbol id that resolves to nothing, so an over-consuming caller landed a silently wrong frame rather than failing where the bug was. Every caller already gates on `hasRemaining`. `reset()` also restores the feed cursor and step, not just the frame and count.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Rename: the row/column vocabulary becomes orientation-neutral. A reel's strip is made of **cells**, and the off-window slots either side are **start** and **end** (start = the smaller main coordinate: above for vertical, left for horizontal), independent of which way the reel travels.

  Run the `v1-to-v2` codemod over your sources. `build()` throws a named error if it still sees a v1 key. The codemod is not on npm yet -- the migration guide has the from-a-clone invocation.

  Core geometry:

  | v1                                          | v2                                    |
  | ------------------------------------------- | ------------------------------------- |
  | `visibleRows`, `visibleRowsPerReel`         | `visibleCells`, `visibleCellsPerReel` |
  | `bufferSymbols({ above, below })`           | `bufferSymbols({ start, end })`       |
  | `ColumnTarget.bufferAbove` / `.bufferBelow` | `.bufferStart` / `.bufferEnd`         |
  | `Reel.bufferAbove` / `.bufferBelow`         | `.bufferStart` / `.bufferEnd`         |
  | `reelPixelHeights`                          | `reelExtents`                         |
  | `Reel.spinSymbolHeight`                     | `Reel.spinCellSize`                   |

  Motion:

  | v1                            | v2                      |
  | ----------------------------- | ----------------------- |
  | `ReelMotion.displace(deltaY)` | `.advance(travelDelta)` |
  | `ReelMotion.slotHeight`       | `.slotPitch`            |
  | `ReelMotion.getRowY(row)`     | `.getCellMain(cell)`    |

  Grid coordinates and payloads:

  | v1                                         | v2                                      |
  | ------------------------------------------ | --------------------------------------- |
  | `SymbolPosition.rowIndex`                  | `.cellIndex`                            |
  | `cascade:*` `winnerRows`, `offsetRows`     | `winnerCells`, `offsetCells`            |
  | `DropOffset.originalRow`                   | `.originalCell`                         |
  | `TumbleConfig.rowStagger` / `.rowOrder`    | `.cellStagger` / `.cellOrder`           |
  | `rowOrder: 'bottomToTop' \| 'topToBottom'` | `cellOrder: 'endFirst' \| 'startFirst'` |
  | `pin:migrated { fromRow, toRow }`          | `{ fromCell, toCell }`                  |
  | `CellPin.originRow`                        | `.originCell`                           |

  Offsets:

  | v1                                                      | v2                            |
  | ------------------------------------------------------- | ----------------------------- |
  | `OffsetXMode`                                           | `CrossOffsetMode`             |
  | `TrapezoidConfig.topWidthFactor` / `.bottomWidthFactor` | `.startFactor` / `.endFactor` |

  Semantics, not just names:

  | v1                                          | v2                                                                             |
  | ------------------------------------------- | ------------------------------------------------------------------------------ |
  | `bufferSymbols({ above, below })`           | `bufferSymbols({ start, end })`                                                |
  | `reelAnchor: 'top' \| 'center' \| 'bottom'` | `'start' \| 'center' \| 'end'`                                                 |
  | `SymbolData.size { w, h }`                  | `{ reels, cells }` (and `getSymbolFootprint`'s `size`)                         |
  | `NudgeOptions.direction: 'up' \| 'down'`    | `'forward' \| 'reverse'`, relative to the reel's own axis                      |
  | `'symbol:created': [symbolId, row]`         | `[symbolId, stripIndex]` -- it was always the strip index, never a visible row |

  `nudge()` is now genuinely direction-relative: which edge feeds the reel is derived from the axis polarity, so a reel built with `direction('reverse')` nudges upward on `'forward'`. A vertical/forward reel behaves exactly as `'down'` did.

  New:

  - `builder.cellStacking(order)` / `builder.reelStacking(order)` expose render order explicitly (`'ascending'` default = today's behaviour: the cell/reel at the larger coordinate draws in front). Deliberately geometric -- `direction('reverse')` does NOT flip stacking, so art lit from above keeps overlapping the way it was drawn.
  - `SymbolPosition.setId?` for games composing more than one reel set. The engine never reads it.
  - `build()` throws when a cross-reel big symbol (`size.reels > 1`) meets a mixed `directionPerReel([...])`. The coordinator assumes one shared feed edge across the reels a block covers.
  - `ReelMotion`'s wrap callback drops its dead `arrayIndex` / `direction` arguments.

  Fail-loud, no silent aliases: `visibleRows()`, `visibleRowsPerReel()` and `reelPixelHeights()` are gone but still present as throwing stubs, and every renamed option key or string value throws from the builder method that received it (`bufferSymbols({ above })`, `multiways({ minRows })`, `symbolData({ size: { w } })`, `tumble({ fall: { rowStagger } })`, `offsetConfig({ topWidthFactor })`, `reelAnchor('top')`, `initialFrame`/`setResult` columns with `bufferAbove`). Each message names the v2 replacement and the codemod. The table itself stays internal: it is 1.x migration scaffolding, and exporting it would semver-lock it into all of 2.x.

  Codemod: the `v1-to-v2` transform rewrites the API surface (AST-based, so it never touches your own `row` / `col` locals or your comments). Verified end-to-end against this repo's 112 site recipes at their pre-rename revision: zero v1 API names left in code. It ships in the repo rather than on npm for now; see the migration guide for how to run it from a clone.

  Docs: a new "Migrating to 2.0" guide covers every rename with a before/after, including the three things the codemod deliberately leaves alone. ADRs, CHANGELOGs and the 1.0 migration guide keep their v1 vocabulary. they are records of what was true then.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove: the standalone HorizontalReel / HorizontalReelBuilder subtree - use orientation('horizontal') on ReelSetBuilder instead.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Internal: the motion contract (ADR 018) now runs in CI against the shipping engine, in all four orientation x direction combinations, and the `createTestReelSet` default symbol size is non-square (120x100) so a test can tell width from height.

  No engine API change, but `createTestReelSet`'s default geometry is a breaking change to anyone writing tests against `pixi-reels/testing`: pass `symbolSize` explicitly if you were relying on 100x100. Filed as major so it lands under Breaking Changes in the changelog, where a reader whose geometry assertions just started failing will actually look.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Remove: the internal negative-index buffer encoding. `ColumnTarget` is now carried unchanged from `setResult()` / `initialFrame()` all the way down to the reel, so no stage of the pipeline materializes `arr[-1]` string properties on an array any more.

  What this changes for consumers:

  - `Reel.placeSymbols(target)` takes a `ColumnTarget` instead of a `string[]`. Wrap a visible-only array as `{ visible: ids }`.
  - `Reel.placeStrip(frame)` is new: it lands a full strip frame (index `0` = furthest buffer-above cell), which is the shape `FrameBuilder.build` returns. Custom stop/cascade phases should use this.
  - `FrameContext.targetSymbols?: string[]` becomes `FrameContext.target?: ColumnTarget`. Middleware reads it with the new `getTargetSlot(target, cell)` helper, or materializes it with `columnTargetToStrip(target, bufferStart)`.
  - `FrameBuilder.build` / `.buildAll` take `ColumnTarget` / `ColumnTarget[]` in the target position.
  - `columnTargetToArray` is gone. `getTargetSlot`, `setTargetSlot`, `columnTargetToStrip` and `cloneColumnTarget` are exported in its place.
  - `refill()` now validates a column against `visible.length` rather than the materialized array length, so a refill grid may carry `bufferStart` / `bufferEnd` entries. Previously a buffer-end entry made the column look too long and threw.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Change: gsap is held per reel set instead of in a module global.

  v1's `utils/gsapRef.ts` stored one instance process-wide, and its own docstring admitted "the last `setGsap` call wins" - so building a second `ReelSet` silently moved the first one's tweens onto a different timeline. Harmless for a single-set game; a real footgun for a composed stage. `builder.gsap(instance)` now binds that set only, captured at `build()`.

  - `driveGsapWithTicker(ticker)` takes the instance as a second argument: `driveGsapWithTicker(ticker, myGsap)`. Pass the same one you gave the builder; omit it only if you never called `.gsap(...)`.
  - Custom `ReelSymbol` subclasses should animate on the new protected `this.gsap`, which `SymbolFactory` binds to the owning set. An imported `gsap` still works when your app and the engine resolve to the same module; `this.gsap` is correct either way.
  - `Reel.gsap` is exposed for custom phases (`this._reel.gsap`).
  - The internal `setGsap` / `getGsap` helpers are gone, replaced by `DEFAULT_GSAP` and the `Gsap` type.

  Nothing changes for a single-set game that never calls `.gsap(...)`.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `StaticSpinSymbol`'s motion blur now smears along the strip on a horizontal set.

  `MotionBlurOptions.axis` defaulted to `'y'` and its docs told you to pass `{ axis: 'x' }` "for a `HorizontalReel`" - a class 2.0.0 deletes. So a horizontal set using `StaticSpinSymbol` smeared vertically, across the direction of travel, with no type error and no throw. The axis now defaults to the owning set's orientation (ADR 016 section 5); an explicit `blur.axis` still wins, for art that wants a deliberate cross-smear.

  `ReelSymbol` gains a protected `this.mainAxis` (`'x'` or `'y'`), bound by `SymbolFactory` at create time, for the few effects that genuinely follow travel. `resize(width, height)` stays screen-space.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `orientation('horizontal')` now supports pyramids, MultiWays, and big symbols. The uniform-only guard at `build()` is gone, so every layout the engine offers works on either axis.

  `Reel` stores its cell size axis-relative (`cellMain` along the strip, `cellCross` across it) and projects back to screen `(width, height)` whenever art is resized. A jagged horizontal set therefore varies cell WIDTH where a vertical one varies height, from the same arithmetic. New accessors: `Reel.cellMain`, `.cellCross`, `.mainGap`, `.crossGap`.

  Breaking, beyond the v2 rename already listed:

  - `reelExtents([...])` and `multiways({ reelExtent })` are MAIN-axis extents (pixel height for vertical, pixel width for horizontal). They were always the vertical reading; the name now means the same thing on both axes.
  - `getBlockBounds` projects through the axis. `size.reels` spans the cross axis and `size.cells` the main axis in every orientation, so the screen width and height a block maps to invert under horizontal. The method name and return shape do not move.
  - `PinOverlayTween` (part of `AdjustPhaseConfig`) is axis-relative: `cellWidth`/`oldCellHeight`/`newCellHeight`/`fromY`/`toY`/`x` become `cellCross`/`oldCellMain`/`newCellMain`/`fromMain`/`toMain`/`cross`.

  Fixed along the way: MultiWays reshape derived its new cell size and its pin-overlay slot pitch from `symbolGap.y` unconditionally. On a horizontal set that is the CROSS gap, so reshaped reels came out the wrong length. Both now read the reel's own main gap (ADR 016 section 6.6).

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Change: `MaskStrategy.build` / `.update` take a single `MaskContext` (`{ rects, width, height, axis }`) instead of positional arguments, and every strategy must declare `readonly version = MASK_STRATEGY_VERSION`.

  Only affects custom strategies; `RectMaskStrategy` and `SharedRectMaskStrategy` are unchanged to use.

  A `ReelMaskRect` is screen-space, so which of its four numbers runs along the strip depends on the orientation: a vertical set puts the strip on `y`/`height`, a horizontal one on `x`/`width`. A strategy written for v1 receives an identically-shaped struct with transposed meaning and no compile error - and handed a `MaskContext` it would read `rects` as an object, find no `.length`, and quietly draw a full-bleed rect that clips nothing. `maskStrategy()` now throws by name on any strategy that does not declare version 2. `MaskContext` and `MASK_STRATEGY_VERSION` are exported.

### Minor Changes

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `BoardGrid` and `HoldAndWinBuilder` take a travel axis, so a board's cells can fill sideways or upward.

  ADR 016 section 7 listed sideways Hold & Win cells as unlocked by the axis work, but `BoardGrid` built every cell with a bare `ReelSetBuilder` and neither it nor `HoldAndWinBuilder` exposed an orientation, so a coin always scrolled in from above.

  ```ts
  new HoldAndWinBuilder().grid(5, 3).axis("horizontal", "reverse");
  ```

  Cells are 1x1 reel sets, so this picks the edge a symbol scrolls in from. It does not touch the board layout: `cols` and `rows` stay board dimensions, and `BoardGrid`/`HoldAndWinBoard` keep that vocabulary deliberately. Defaults to vertical / forward, unchanged.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `CardSymbol`, `CARD_DECK` and `WILD_CARD` ship from the package. A playing-card tile drawn with `Graphics` -- coloured body, glyph fitted to the cell, glyph-only win pulse -- so a prototype runs with no art at all: `import { CardSymbol, CARD_DECK, WILD_CARD } from 'pixi-reels'`. It previously lived in `examples/shared` and could only be copy-pasted.

  It uses the reel set's own gsap instance rather than importing gsap, so it is safe under a symlinked workspace.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the tumble cell stagger now follows gravity, so a reel that drains upward peels and refills from the top instead of the bottom.

  `tumble({ fall, dropIn })`'s `cellOrder` resolved against the raw cell index and nothing else. Under the usual downward gravity that reads correctly -- the bottom cell, the one at the exit edge, goes first -- but on a reel draining the other way it staggered from the cell FURTHEST from the drain, so the cell about to leave first waited for the whole column to clear ahead of it. The geometry was already gravity-correct (symbols travelled and entered through the right edges); only the timing read backwards, which is why nothing caught it. `.direction('reverse')` with the default `gravity: 'auto'` was the visible case.

  `cellOrder` now accepts `'auto'` and defaults to it. `'auto'` starts at the gravity-EXIT end -- the edge symbols are settling against -- so the canonical "bottom-left first, top-right last" feel is unchanged for every downward-gravity reel, and inverts by itself when gravity does. Nothing changes for a set that does not override gravity or direction.

  `'endFirst'` and `'startFirst'` keep their meaning and are now explicitly geometric, like the buffers (ADR 016 section 3.4): they name an end of the strip and ignore gravity. Pass one to pin a screen edge regardless of which way the board drains.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `tumble({ gravity })` so cascades work on reverse and horizontal reels (ADR 016 section 3.6).

  Cascade refills used to be hard-coded to settle toward the larger cell index. On a reel built with `.direction('reverse')` that meant the board drained one way and refilled through the edge it had just emptied, with survivors sliding against the reel's own travel. The two halves disagreed internally too: `distance: 'auto'` applied the reel polarity while the default `'perHole'` did not, so changing one animation-tuning field flipped which edge symbols entered from.

  `gravity` defaults to `'auto'`, which follows each reel's own direction, so a reverse or horizontal set now cascades correctly with no extra configuration:

  ```ts
  builder.direction("reverse").tumble({}); // drains upward, refills from below
  builder.orientation("horizontal").tumble({}); // drains right, refills from the left
  builder.tumble({ gravity: "reverse" }); // spin one way, drop the other
  ```

  Whichever edge gravity exits by is the edge your server must pack survivors against in the grids it sends -- the engine animates the result, it does not reorder it.

  `DropOffset` gains an `isNew` field. Branch on that rather than `originalCell < 0`, which only discriminates under forward gravity. `computeDropOffsets` takes an optional `gravity` and still defaults to `'forward'`.

  `createTestReelSet` gains a `tumble` option so a cascade test can pick an orientation and direction without hand-rolling a builder.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `PhaseConstructor`, `PhaseCreatorFn`, `PinOverlayTween` and `TickerCallback` are now exported as types. Each appears in the signature of something already exported (`PhaseFactory.register`, `AdjustPhaseConfig.pinOverlays`, `TickerRef.add`), so a consumer could hold the value but never name it.

  Fix: `ReelSymbol.onReelSpinStart`'s documented parameter name matches the signature again, and the `SymbolSpotlight` ADR link no longer points at a path that does not exist.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `ReelSet.getTargets(): ColumnTarget[]` and `Reel.getTarget()`. The whole board as the same shape `setResult` takes -- buffers included, big-symbol anchors at their true positions -- so `reelSet.setResult(reelSet.getTargets())` reproduces what is on screen.

  `getVisibleGrid()` is unchanged and still returns `string[][]`. It reports the visible window only, so it cannot be replayed: a block anchored in `bufferStart` with just its tail showing reads as that id at visible cell 0, and feeding that back re-anchors the block there. Use `getVisibleGrid()` to read the board for win logic, and `getTargets()` to capture and replay one.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `debugOverlay` gains the axis-aware layers.

  - `axis` draws one arrow per reel along the travel axis, pointing the way it goes.
  - `feed` marks the strip edge new symbols arrive at.
  - `thresholds` draws the two wrap lines, so contract laws L7 and L9 are watchable: drive a spin and no symbol should ever be drawn past one.
  - `hud` now reports orientation, direction and feed edge per reel (`r0 VF feed=start spd=... cells=...`).

  Add: `overlay.describe()` returns a plain-JSON summary of what those layers represent, per reel - orientation, direction, feed edge, the arrow's signed main-axis span, the feed marker and both thresholds. PixiJS renders to a canvas that CI and AI agents cannot see; this is the same information in a form `expect` can read. A mirrored arrow has identical bounds, so the signed span is the only thing that can tell a reverse reel from a forward one.

  Fixed: the `buffers` and `hud` layers positioned themselves off `container.x` / `mainOffset` directly, so they drew in the wrong place on a horizontal set. Both now project through the reel's axis, as does every new layer. Each layer's `Graphics` carries a `label` (`pixi-reels:debugOverlay:<layer>`) for the Pixi devtools and for tests.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: reverse and mixed per-reel travel direction now spin and land correctly on a vertical set. `StopSequencer` feeds the target frame from the direction-appropriate edge (head-first for reverse reels, tail-first for forward), so `direction('reverse')` (roll-up) and `directionPerReel([...])` (alternating columns) land the exact requested grid. Forward reels are unchanged. Horizontal orientation still fails loud until its set geometry lands.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `orientation('horizontal')` for uniform grids. A single horizontal reel is the banner - cells march along X, the strip travels on X, and it spins and lands through the same lifecycle as a vertical set. The builder projects viewport extents, cross-marching pitch and mask rects through the set axis, `Reel` derives its motion cell size / cross pitch from the axis (symbol art still sizes to screen width x height), and `ReelSet.getCellBounds` projects to screen. Pyramid / MultiWays horizontal fail loud for now.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `ReelSetBuilder.orientation()` / `direction()` / `directionPerReel()` and per-reel `ReelAxis` threading (plus a `reel.axis` accessor). The axis is wired through the motion + phase layers. Vertical forward is fully supported. `orientation('horizontal')` and any reverse direction fail loud at `build()` for now - their set-level geometry and the StopSequencer feed edge (ADR 016 section 6.1) land in a later commit, so failing loud beats a mis-laid or non-landing spin.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: fire the declared-but-unfired `spotlight:start` (with the highlighted positions) and `spotlight:end` events. `SymbolSpotlight` now receives the ReelSet emitter and brackets each spotlight presentation; a teardown with nothing active stays silent.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `debugOverlay(reelSet, { layers, live, ticker })` - a layered visual debug overlay for the static / at-rest layers (`mask`, `cells`, `buffers`, `bounds`, `blocks`, `pins`, `hud`). It draws into a `Container` added to the `ReelSet` itself, so it renders above the viewport (including the spotlight container) rather than under it like `showMask`. The handle exposes `setLayers(...)`, `redraw()` and `destroy()`, implements `Disposable`, pools its `Graphics`/`Text` (never recreated per frame), and when `live: true` drives per-frame redraw of the live layers through `TickerRef` (default `Ticker.shared`, override via `ticker`). Static layers only redraw on `shape:changed` / `adjust:complete`. Also reachable as `__PIXI_REELS_DEBUG.overlay(...)`. Dev-only, same caveat as `enableDebug`: it reads internals, is not semver-protected, and must not reach a production bundle. The axis / feed / thresholds layers arrive with A11b once `ReelAxis` is wired through `Reel`.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `ReelAxis` projection value object (`reelAxis()`, `VERTICAL_FORWARD`) plus `Orientation`/`Direction` types. Unused for now - the foundation for orientation-generalized motion (ADR 016). No behavior change.

### Patch Changes

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Docs: document `anticipation:reel`, `anticipation:reelEnd` and `cascade:gravity:error`, which the engine emitted but no page mentioned.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Perf: `build()` no longer constructs and discards an `OffsetCalculator`.

  The instance was never read, but its constructor runs `_compute()`, so every
  `ReelSetBuilder.build()` was laying out a full per-reel/per-cell offset table
  and throwing it away. Confirmed it contains no `throw`, so it was not doubling
  as a validator. Also drops an unused local in `StartPhase`. No behaviour change.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the big-symbol weight error said random fill "never enters random fill in v1", which reads as a v1-only restriction on a v2 build. It is not version-scoped.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: an empty `bufferStart` / `bufferEnd` no longer trips the buffer-range check.

  `assertBufferCountsInRange` compared `highestDefinedIndex(entries) >= capacity`, and that helper returns `-1` for "no entries at all". When a reel reports a NEGATIVE capacity -- which happens transiently during a cascade, where the strip is briefly shorter than `bufferStart + visibleCells` -- the test became `-1 >= -4` and threw on a column that specified no buffer entries at all:

  ```
  runCascade(): nextGrid column 0: bufferEnd has a symbol at index -1,
  beyond engine bufferSymbols=-4
  ```

  The check only ever ran on `setResult`, where reels are settled and capacity is never negative, so it stayed latent until `refill()` and `runCascade()` began validating their grids in this release. A column that specifies nothing can never have an entry dropped, so it is always in range.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: a horizontal reel set laid out its initial strip with no gap between cells. `Reel._setupSymbolPositions` stepped by `spinCellSize + symbolGapY` -- the screen VERTICAL gap -- instead of the travel-axis gap. On a vertical set the two are the same value, so this was invisible; on a horizontal one the main gap is `symbolGapX`, so symbols touched until the first spin handed positions to `ReelMotion` (which projects correctly) and they silently snapped apart.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Docs: the 2.0 migration guide subscribed with `reelSet.on(...)`, which does not exist. Corrected to `reelSet.events.on(...)`.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `movePin()` flew the symbol to the wrong place on a horizontal reel set. It read `_pinOverlayCellMain` (a travel-axis coordinate, which is `x` when `orientation('horizontal')`) straight into `.y`, and the reel's main offset into `.x`. Both are numbers, so nothing threw. Now routed through `axis.toScreen`, like every other pin-overlay site.

  Fix: `setShape()`'s parameter and the `shape:changed` payload label are `cellsPerReel`, not the v1 `rowsPerReel`. The old name shipped in the `.d.ts` and in two runtime error messages.

  Fix: the big-symbol split error printed `anchor + h + distance` while the predicate tested `anchor + h - 1 + distance`, so the number in the message was one off from the one that failed.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `debugOverlay`'s `hud` layer is readable. It stacks its lines instead of overprinting them, and sits on a backing plate.

  Each line was anchored at its own reel's top-left corner, which assumes a line fits inside a reel. It does not: roughly 40 characters at 11px monospace is ~230px against a cell that is typically ~100px wide. On any set past two reels every line ran across its neighbours into an unreadable smear, and it got worse the more reels you had -- which is exactly when the hud is worth reading.

  The lines are now one left-aligned column anchored inside the mask's top-left, one per reel, so they read at any reel count and in either orientation. Stacking them _outside_ the mask would keep the reels clear, but a host that framed its camera on the reel set before the overlay existed then renders the whole block off-screen, and an invisible hud is worse than a cluttered one. Drop `hud` from `layers` if it covers art you need to see.

  Also: 10px on an 11px leading rather than 11/13, a translucent black plate behind the column so white text survives bright symbols, and `resolution = 1` on the lines so small glyphs rasterize blocky instead of grey-smeared.

  The `r<n>` prefix still ties a line to its reel, and the `cells` layer still labels each cell `reel,cell`. Nothing about the reported fields changed.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `reelSet.destroy()` left every in-flight spin-phase tween running. `SpinController.destroy()` dropped its active-phase map without skipping the phases first, and `onSkip()` is the only thing that kills the gsap timelines they own (start ramp, anticipation, stop bounce, cascade fall/drop-in). Those timelines outlived the set and kept writing reel speed and symbol view positions to display objects `destroy()` had already freed. It bites hardest in the setup the docs recommend — gsap driven off a PixiJS ticker — because the orphaned tweens do not stop when the set's own app goes away: any other live ticker keeps advancing the shared root timeline. Destroying a reel set mid-spin now force-completes its active phases first, and bumps the spin generation so no already-awaiting phase chain starts a fresh phase on the way down.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the auto-picked mask strategy's console notice names the gap it actually keyed on. The auto-pick has read the CROSS-axis gap since `orientation()` landed, but the message still said `symbolGap.x > 0` verbatim -- so on a horizontal set it pointed at the main-axis knob, and turning that one did nothing to the behaviour being explained. It now reads `symbolGap.x` on a vertical set and `symbolGap.y` on a horizontal one.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `setResult()` and `initialFrame()` now reject a plain `string[][]` with a message that names the fix. Previously the value reached a spread of `target.visible` deep in the frame pipeline and threw `TypeError: target.visible is not iterable` -- after the reels were already moving, so the spin promise never settled and the reel spun forever with no usable clue.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the published tarball now actually contains `README.md` and `LICENSE`. Both were listed in `package.json`'s `files` but neither existed inside the package, and npm drops a `files` entry that matches nothing without warning -- so the npm page would have been blank and an MIT-licensed package would have shipped no licence text.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Internal (docs site): recipes can return a `stage` container so a multi-set composition scales and centres as one. No library change.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `movePin` placed the flight symbol at the source cell's bare reel-local Y, dropping the reel's container offset and mixing the masked (reel-local) vs unmasked (viewport-space) coordinate conventions. Route flight placement through `_pinOverlayCellY` so it agrees with pin overlays on any layout with a nonzero reel offset. No API change.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Docs: ADRs 016 / 017 / 018 move off Proposed and record where the implementation diverged from the plan; `ROADMAP.md` and `TODO.md` are reconciled (horizontal reels, mixed direction per reel and roll-up all close in 2.0.0). No code change.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Refactor: `ReelMotion` now projects through a `ReelAxis` and derives symbol positions from array index (and rotation count from total travel) instead of accumulating deltas. Behavior is unchanged for the default vertical/forward axis; the derive model also fixes a latent float-residue wrap-skip at exact N-slot travel (motion contract L7). Internal - the axis defaults to vertical/forward, so callers are unaffected.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Refactor: `Reel` routes its own position writes through the injected `ReelAxis` - container placement (cross marches reels, main carries the offset), `_placeSymbolView`, the unmasked re-sync (absolute cross, incremental main), and every reel-local conversion. Behavior is unchanged for the default vertical/forward axis. Internal; `ReelConfig` gains an optional `axis`.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Refactor: rename `SpinningMode.computeDeltaY(symbolHeight, ...)` to `computeDelta(slotPitch, ...)`. The parameter was always the slot pitch (the caller passes `motion.slotHeight`); the name now matches. Returns signed travel along the reel's axis. The full-slot wrap-skip risk the old cap guarded (contract L7) is gone with the derive-from-index motion, so the cap is now only smoothing.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Refactor: route the non-cascade spin phases' GSAP position tweens through `reel.axis` instead of a hardcoded `.y`. StopPhase's landing bounce now overshoots in the direction of travel via `base + axis.polarity * bounceDistance` on `axis.mainProp`, and reads/restores the reel container's base position through `axis.getMain`/`setMain`. AdjustPhase's MultiWays pin-overlay squash and slide now write `scale[axis.mainProp]` and position via `axis.setMain`/`setCross`. StartPhase's step-back is a speed tween (already direction-relative through the motion layer) and is unchanged. Vertical/forward is byte-identical.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Refactor: the tumble cascade phases position symbols through the injected `ReelAxis`. `CascadeFallPhase` and `CascadeDropInPhase` read start positions via `axis.getMain`, write via `axis.setMain`, and build their GSAP tweens with a computed `axis.mainProp` key; fall/drop distances now carry `axis.polarity` so gravity follows the reel's travel axis. Grid origins (`originalRow * cellHeight`) stay direction-agnostic. Behavior is unchanged for the default vertical/forward axis (`mainProp: 'y'`, `polarity: 1`). `CascadePlacePhase` and `tumbleAlgorithm` were unaffected (visibility/identity swap and cell-index math, no position writes). Internal only.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `ReelViewport.updateMaskSize` now resizes the dim overlay. A viewport resize (e.g. a MultiWays reshape growing the tallest reel) no longer leaves the spotlight dimming a stale rectangle.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Docs: a guide for orientation and direction (the headline of 2.0.0), the new builder methods in the API reference, and the debug overlay's axis layers plus `describe()` in the debugging guide. No code change.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Internal: browser coverage for all four orientation x direction combinations, via a new `tests/e2e/fixtures/orientation-matrix` fixture and a Playwright spec wired into CI. No library change.

- [#197](https://github.com/schmooky/pixi-reels/pull/197) [`847d9cd`](https://github.com/schmooky/pixi-reels/commit/847d9cde6c3757fc6f83360c49764c55a0f98dcc) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Internal: cover the natural (non-slam) stop on reverse and mixed-direction reels. No API change - this closes a test gap, it does not change behaviour.

## 1.6.1

### Patch Changes

- [#194](https://github.com/schmooky/pixi-reels/pull/194) [`1a9e258`](https://github.com/schmooky/pixi-reels/commit/1a9e25844536a4d2fc7c770392812ca078b5c173) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: commit a MultiWays reshape BEFORE the fall in cascade (classic-tumble) mode when the target shape is known at spin time. `CascadeFallPhase` drops a reel's current visible rows, and the reshape used to run only after the fall (between SPIN and STOP, where standard mode's spin blur hides it), so in cascade mode a reel that changed height dropped its old, differently-sized board and then snapped to the new shape. a reel visibly changing height mid-tumble. Now, if `setShape()` is called BEFORE `spin({ mode: 'cascade' })`, the reshape commits before the fall so the reel falls at its target height. The legacy `spin()` then `setShape()` ordering is unchanged (the reshape still lands after SPIN). For a clean per-spin reshape in a classic tumble, call `setShape()` before `spin({ mode: 'cascade' })`.

## 1.6.0

### Minor Changes

- [#191](https://github.com/schmooky/pixi-reels/pull/191) [`ff7658b`](https://github.com/schmooky/pixi-reels/commit/ff7658b8d7f800239b1a8e9549fd74b1b680f85c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `bufferSymbols({ above, below })`. asymmetric buffer rows, including `below: 0` for tumble-only reel sets. A pure tumble never scrolls the strip, so the below-window cells exist only to be hidden by the mask; dropping them means nothing can ever peek out under the grid. Requires `.tumble(...)` on the builder (validated at `build()`); strip spins (`spin({ mode: 'standard' })`) and `nudge()` throw on such a set because both move symbols through the below-window buffer. The number form keeps its exact legacy behavior (symmetric count, minimum 1 with a clamp warning).

- [#191](https://github.com/schmooky/pixi-reels/pull/191) [`ff7658b`](https://github.com/schmooky/pixi-reels/commit/ff7658b8d7f800239b1a8e9549fd74b1b680f85c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `RunCascadeOptions.presentWinners`. a win-presentation hook awaited after detection and BEFORE `destroySymbols`, while the winners are still on the board. This is the natural seat for a `WinPresenter` pass (play the authored win clip, dim losers, then let the library destroy the cells): a round's presentation order is win → destroy → refill. `onCascade` keeps its post-destroy timing unchanged.

### Patch Changes

- [#191](https://github.com/schmooky/pixi-reels/pull/191) [`ff7658b`](https://github.com/schmooky/pixi-reels/commit/ff7658b8d7f800239b1a8e9549fd74b1b680f85c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: re-mask lifted `unmask` symbols through the cascade refill path. A pure `refill()` never passes through `StartPhase` (strip spins) or `notifySpinStart` (tumble fall), so a symbol with `unmask: true` arriving via drop-in stayed parented in `viewport.unmaskedContainer` and rendered its whole above-viewport approach outside the reel mask. floating over the page before landing. `CascadePlacePhase` and `CascadeDropInPhase` now call `reel.beginMotion()` on entry (idempotent, same rule as `StartPhase._launch`); `notifyLanded` re-lifts once the refill settles.

- [#191](https://github.com/schmooky/pixi-reels/pull/191) [`ff7658b`](https://github.com/schmooky/pixi-reels/commit/ff7658b8d7f800239b1a8e9549fd74b1b680f85c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: cascade refills notify `onReelLanded()` on MOVERS only. survivors that slid and new arrivals. Untouched survivors (offsetRows 0) no longer replay their landing animation on every cascade stage, which read as the whole board twitching after each pop. `Reel.notifyLanded(landedRows?)` gained an optional visible-row filter (strip-spin landings are unchanged. every visible symbol still lands); the gravity stage of two-stage refills now fires each slid survivor's landing reaction the moment it settles.

## 1.5.0

### Minor Changes

- [#188](https://github.com/schmooky/pixi-reels/pull/188) [`a586390`](https://github.com/schmooky/pixi-reels/commit/a586390f79798f5fcbda3d7bdedc03e9292f64e5) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: anticipation-aware spin presentation — new `ReelSymbol.onReelAnticipationStart()` lifecycle hook, fired on every strip symbol when its reel enters the anticipation phase (and on symbols installed mid-tease). `StaticSpinSymbol` uses it to crossfade the baked motion blur back to the crisp snapshot, so the slowed tease strip is readable instead of smeared.

- [#188](https://github.com/schmooky/pixi-reels/pull/188) [`a586390`](https://github.com/schmooky/pixi-reels/commit/a586390f79798f5fcbda3d7bdedc03e9292f64e5) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `SpineReelSymbol` multi-skin skeleton support — spineMap entries accept an optional `skin`, so several symbolIds can share one multi-skin skeleton (e.g. a `lowSymbols` skeleton carrying `low1`..`low5` as skins) instead of shipping one skeleton per symbol.

- [#188](https://github.com/schmooky/pixi-reels/pull/188) [`a586390`](https://github.com/schmooky/pixi-reels/commit/a586390f79798f5fcbda3d7bdedc03e9292f64e5) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: `symbolData` `unmask` is now an at-rest presentation. While the reel spins, unmasked ids stay in the masked reel container like every other symbol — previously they scrolled visibly outside the grid and buffer-row instances sat parked beyond the mask edge, visually breaking the reels. On land, visible-row instances are lifted into the viewport-wide `unmaskedContainer` (above every reel and outside the mask), and re-masked the instant the reel begins to move on the next spin (at the start of the accel ramp, not once it reaches full speed — so a lifted symbol never floats above the mask while the strip scrolls under it).

- [#188](https://github.com/schmooky/pixi-reels/pull/188) [`a586390`](https://github.com/schmooky/pixi-reels/commit/a586390f79798f5fcbda3d7bdedc03e9292f64e5) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `symbolData` `unmask: true` now works on jagged / pyramid layouts (reels with a non-zero `offsetY`). Previously the builder threw at config time, because the motion layer writes bare reel-local Y and would drop the reel offset from a lifted view on every snap. Since unmask is now an at-rest presentation (a view is only lifted while the reel is stopped), `Reel._syncUnmaskedViewOffsets()` re-bakes `container.y` after each absolute `motion.snapToGrid()`, and the frequent mid-spin snaps never touch a lifted view. The `unmask + pyramid layout is not supported` build-time throw is removed.

## 1.4.0

### Minor Changes

- [#186](https://github.com/schmooky/pixi-reels/pull/186) [`b6d1649`](https://github.com/schmooky/pixi-reels/commit/b6d1649ec8102f64063479e81dacd5ad920606e8) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: static / motion-blurred snapshot spinning — spin cached textures instead of live symbols. New `SpinTextureCache` captures any symbol into a per-symbolId `RenderTexture` (or accepts hand-authored textures via `setStatic` / `setBlurred`, which always win and are never destroyed by the cache) and bakes a motion-blur variant in a one-time `BlurFilter` pass — no filters run during the spin. The smear follows the reel's travel axis: vertical by default, `blur: { axis: 'x' }` for a `HorizontalReel` strip. New `StaticSpinSymbol` wraps any `ReelSymbol` (Spine included): while the reel spins it deactivates the inner symbol and shows the cached snapshot, crossfading crisp→blurred over `blurRampMs`; symbols wrapping in mid-spin only retarget a sprite texture; on land the live symbol is reactivated. `prewarmSpinTextures()` bakes all ids up front so the first spin never hitches. Engine: `onReelSpinStart` now also fires (with a new `joinedMidSpin` arg) on symbols installed while a reel is already spinning, spin start/end notifications reach buffer rows, a slam-stopped `StartPhase` no longer skips `notifySpinStart`, and `HorizontalReel` now fires the symbol spin hooks across its conveyor (`onReelSpinStart` at `spin()` and on mid-spin feeds; `onReelSpinEnd` at `setResult()` so the visible deceleration runs crisp and the landing window feeds in live — what lands is never blurred; `onReelLanded` on land) — fixing Spine `autoPlayBlur` gaps where mid-spin, slammed, or horizontal-strip symbols stayed on `idle`. Spin-state hooks must now be idempotent; `SpineReelSymbol.playBlur()` no longer restarts an already-running blur loop, and `SpineReelSymbol` applies the idle pose immediately on activation (`spine.update(0)`) so same-frame renders and snapshot captures see the posed skeleton instead of nothing.

## 1.3.0

### Minor Changes

- [#183](https://github.com/schmooky/pixi-reels/pull/183) [`5bddccb`](https://github.com/schmooky/pixi-reels/commit/5bddccb105e7a913f4858c2e86e119c7098b9319) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: staggered / sequential anticipation so teasing reels build tension one after another instead of all slowing down at once.

  `setAnticipation(reelIndices, stagger?)` now takes a second argument controlling when each reel BEGINS its slow-down (offsets are by tease-order, not raw reel index):

  - `0` (default) — every anticipation reel starts slowing together (unchanged behaviour).
  - `number` — reel at tease-order `k` starts `k * stagger` ms after the first.
  - `number[]` — explicit per-tease-order offset in ms.
  - `'sequential'` — each reel waits until the previous anticipation reel has fully landed before it starts.

  Add: progressive slow-down. Pass `setAnticipation(reels, { stagger, slowdown })` where `slowdown` (`{ from, to, holdFrom, holdTo }`) interpolates across the tease sequence, so each successive reel decelerates to a lower speed and/or holds longer than the last — the escalating "each reel crawls slower than the one before" build-up. Omit it for the previous flat 30%-and-hold tease.

  Add: `duration` override — `setAnticipation(reels, { duration })` sets the tease hold in ms regardless of the active speed profile, so anticipation keeps playing in Turbo / SuperTurbo (whose profiles use `anticipationDelay: 0` and previously skipped it entirely).

  Add: `anticipation:reel` (`{ reelIndex, order, total }`) and `anticipation:reelEnd` (`{ reelIndex }`) events — a dedicated per-reel tease start/end signal so games can drive tension SFX, pitch ramps (`order / (total - 1)`), and escalating visuals without re-deriving the tease set from `spin:stopping`. Fired only for reels that actually tease.

  Add: `anticipationForScatters(grid, { symbol, trigger, mode })` — derive the tease reel list straight from a result grid (`grid` is the same `ColumnTarget[]` you pass to `setResult`). Anticipation begins on the reel after the `trigger`-th scatter; `mode: 'all-remaining'` teases every following reel, `'scatter-only'` teases only reels that actually hold the symbol (so a 3-scatter result doesn't slow the empty reels).

  Fix: after an anticipation tease the reel now carries its slow speed into the stop and crawls onto its landing frame, instead of snapping back to full spin speed and doing a fast re-spin into position.

  `spin:stopping` now fires when a reel actually begins slowing (after its stagger offset), so tease SFX/VFX can sync to the real start. The stagger and slowdown reset at the start of every `spin()`.

  Also: `setStopDelays(null)` / `setDropOrder(null)` now CLEAR a per-reel stop-delay override and restore the default `i * speed.stopDelay` stagger — distinct from passing all-zeros (which lands every reel simultaneously).

## 1.2.0

### Minor Changes

- [#176](https://github.com/schmooky/pixi-reels/pull/176) [`01639b0`](https://github.com/schmooky/pixi-reels/commit/01639b0f45bc3ac2748329608b700fc90f46f555) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `HorizontalReel` + `HorizontalReelBuilder` — a single one-row, sideways reel
  for the "these symbols pay this round" banner above the reels. It reuses the
  engine's own contract, so there is nothing incompatible to learn: `spin()`
  returns a promise, `setResult(symbols)` takes the same `ColumnTarget[]` as
  `ReelSet` (one entry — this reel is a single column), and the promise resolves
  with the engine's `SpinResult`. `skipSpin()`, `isSpinning`, and the `spin:start`
  / `spin:complete` events all mirror `ReelSet`. `cascade(winners, newIds?)` runs
  a real tumble one row wide: the winning symbols are removed, the survivors
  collapse to close the gaps, and new symbols slide in from the feed side to
  refill. Built on the shared symbol pool / `TickerRef` / `EventEmitter`
  primitives, cleaned up via `destroy()`.

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
