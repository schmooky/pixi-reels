# ADR 016: Orientation axis and travel direction

## Status: Proposed (v2.0.0, breaking)

Companion: **ADR 017** splits facing from travel (§A) and proposes the `ReelStage` composition layer
(§B), including three seams that belong inside this ADR's breaking window.

Supersedes the `horizontal/` subtree. Retires `ROADMAP.md:31` (`Horizontal reels [partial] major p2`),
and picks up two other roadmap rows for free: *Mixed direction per reel (up vs down)* and *Roll-up
(symbols rise from below)*.

Every factual claim below was checked against HEAD (`1.6.1`, `1b3a1a5`). Claims marked **[unverified]**
are design assertions, not observations.

---

## 1. Context — what "horizontal" costs today

`src/horizontal/` is 747 lines (`HorizontalReel.ts` 560, `HorizontalReelBuilder.ts` 141,
`HorizontalReelTypes.ts` 46) of parallel engine. It imports nine things from the real one — `Container`,
`EventEmitter`, `SymbolFactory`, `SymbolRegistry`, `ReelSymbol`, `TickerRef`, `Disposable`,
`ColumnTarget`, `SpinResult` — and reimplements everything else. Its own JSDoc already names the fix
(`HorizontalReel.ts:44-52`):

> give `Reel`/`ReelMotion`/`ReelViewport` an **orientation axis** so ONE reel does vertical or
> horizontal, and this class retires in favour of a 1-reel horizontal `ReelSet`.

The divergence is not cosmetic:

| | vertical | horizontal |
|---|---|---|
| events | **46** (`ReelEvents.ts:41-404`) | 3 (`HorizontalReelTypes.ts:36-46`) — and one of them, `cascade:complete`, isn't a `ReelSet` event name at all. 44 of 46 are unreachable. |
| builder methods | 28 | 11 |
| speed profiles | `SpeedManager` + 3 presets + per-profile tumble overrides | one scalar `spinSpeed` (px/frame) |
| landing | `StopPhase` GSAP two-leg bounce, `bounceDistance`/`bounceDuration` | hardcoded 120 ms linear glide (`HorizontalReel.ts:447-457`) |
| RNG | `RandomSymbolProvider` — weighted, exclusions | `_randomId()` — uniform (`:542-544`) |
| symbol swap | `Reel._replaceSymbol` — same-id fast path, zIndex, `symbol:created`, unmask reparenting | `_repaint` — unconditional release+acquire (`:416-431`) |
| destruction | `ReelSymbol.playDestroy()`, overridable, `AbortSignal`-aware | hand-inlined implode (`:485-495`); `playDestroy` **never called** |
| cascade | `runCascade` chains, `detectWinners`/`nextGrid`, `tumbleAlgorithm`, `TumbleConfig` | one stage, `Promise<void>`, fires no land hooks |
| time base | uniformly ms, `MAX_TICK_MS` clamp, half-slot displacement cap | mixes `deltaTime` (spin) and `deltaMS` (land/cascade), no clamp (`:370-380`) |

Absent entirely, with no stub and no throw: anticipation, spotlight, `WinPresenter`, pins,
hold-and-win, nudge, reshape/MultiWays, big symbols, `StopSequencer`, `setDropOrder`, `SpinningMode`,
`FrameBuilder`/middleware, `OffsetCalculator`, `SpinOptions` (watchdog, `AbortSignal`, `holdReels`),
`enableDebug`, GSAP DI, pool capacity, `symbolData`/`weights`.

Two places actively lie about compatibility. `setResult` accepts the real `ColumnTarget[]` and then
hard-throws on `bufferAbove`/`bufferBelow` (`:206-208`) — buffers exist internally (hardcoded to
exactly 1 each side, `:109`) but are unreachable and unconfigurable. And `destroy()` mid-spin resolves a
**fake** `{symbols: [[]], wasSkipped: true}` (`:349`) where the real path rejects
(`SpinController._abortSpin:1695` → `_finishSpin`).

The cost is not "one duplicated class." It is that every future feature has to be written twice, and the
second copy silently rots. `snapshot/` is the proof that the right shape exists — it is the only
subsystem with a real axis parameter (`MotionBlurOptions.axis: 'y' | 'x'`), it shipped that way in
1.4.0, and it works.

---

## 2. The four concepts currently conflated

Everything in this ADR follows from separating these:

1. **Orientation** — which screen axis the strip travels along.
   `'vertical'` (strip runs on Y, reels marched along X) or `'horizontal'` (strip on X, reels on Y).
   **ReelSet-level**: the mask rect layout, cross-axis reel marching, and `getVisibleGrid()` all assume
   one shared cross axis.
2. **Direction (polarity)** — which way along that axis symbols travel.
   `'forward'` (toward larger coordinate: down / right) or `'reverse'` (up / left).
   **Per-Reel**, overridable **per spin**.
3. **Gravity** — which way cascade symbols fall.
   Defaults to the reel's direction, independently settable. A reel that spins upward and tumbles
   downward is a legitimate design; today the two are the same `+Y`.
4. **Facing** — which way is "up" for the symbol art.
   **ReelSet-level**, identity by default. Split out in ADR 017 §A. The invariant: **changing travel
   never changes facing** — art stays upright when a reel goes sideways or upward. This is what makes
   §3.3's "screen-space stays screen-space" a rule rather than a lucky property.

Today the first three are fused into "the sign of `deltaY`", and facing is fused into orientation.

Direction alone is currently encoded three incompatible ways at once: the sign of a scalar (`ReelMotion.displace`; `StandardMode`'s symmetric
clamp vs `CascadeMode`'s one-sided `Math.min`), a string union (`NudgeOptions.direction: 'up'|'down'`;
`HorizontalReel`'s `'ltr'|'rtl'`), and array-order convention (`StopSequencer.next()` tail-first).

*(Note: `ReelMotion`'s wrap callback also passes a `'up'|'down'` argument, but `Reel._onSymbolWrapped`
at `Reel.ts:1352-1378` never reads it — it re-derives position via `indexOf`. It is a dead parameter,
not a fourth encoding. This matters for §10.3.)*

---

## 3. Decision

### 3.1 `ReelAxis` — a projection value object

One immutable object per reel, built by the builder, injected into `ReelMotion`, `Reel`, and every phase.

```ts
export type Orientation = 'vertical' | 'horizontal';
export type Direction = 'forward' | 'reverse';

export interface ReelAxis {
  readonly orientation: Orientation;
  readonly direction: Direction;
  /** +1 for 'forward', -1 for 'reverse'. */
  readonly polarity: 1 | -1;
  /** GSAP / Pixi property key for the travel axis. */
  readonly mainProp: 'x' | 'y';
  /** GSAP / Pixi property key for the reel-marching axis. */
  readonly crossProp: 'x' | 'y';
  /** Which strip edge new symbols enter from: 'start' when polarity > 0. */
  readonly feedEdge: 'start' | 'end';

  getMain(view: Container): number;
  setMain(view: Container, v: number): void;
  addMain(view: Container, d: number): void;
  getCross(view: Container): number;
  setCross(view: Container, v: number): void;
  /** Screen-space (width, height) → (cross size, main size). */
  toLocal(width: number, height: number): { cross: number; main: number };
  /** (cross, main) → screen-space (x, y). */
  toScreen(cross: number, main: number): { x: number; y: number };
  withDirection(d: Direction): ReelAxis;
}
```

No `Vec2`, no per-frame allocation on the hot path — `addMain` is one branch and one `+=`.

`mainProp` matters more than it looks. The bounce, the cascade fall, the drop-in and the AdjustPhase
pin squash are all **GSAP tweens built from a property name** (`StopPhase.ts:110-116`,
`CascadeFallPhase.ts:191`, `CascadeDropInPhase.ts:305`, `AdjustPhase.ts:130-133`). Swapping numbers is
not enough; you must swap the key. Computed keys in the GSAP vars object handle this cleanly.

### 3.2 Travel coordinates — direction leaves the motion layer

`ReelMotion` today infers direction from `sign(deltaY)` (`ReelMotion.ts:58-62`). Replace with:

```ts
advance(travelDelta: number): void {
  const d = this._axis.polarity * travelDelta;
  if (d === 0) return;
  for (const s of this._symbols) this._axis.addMain(s.view, d);
  if (d > 0) this._wrapEndToStart(); else this._wrapStartToEnd();
}
```

`travelDelta` is **signed travel**: normally positive, but `StartPhase`'s step-back pull
(`StartPhase.ts:54-61`, `speed: -2` → `StandardMode.ts:11-17` returns a negative, symmetrically clamped
value) legitimately produces a negative one. "Travel" means *relative to the reel's own direction*, not
*always positive*. Both wrap branches therefore stay, and both stay reachable in every
orientation/direction combination — which is the point: the sign now means "backwards for this reel"
instead of "downward on screen."

**The strip array stays ordered by screen position** — index 0 = smallest main coordinate = top
(vertical) / left (horizontal), regardless of direction. This is load-bearing: `snapToGrid`
(`ReelMotion.ts:66-71`), `getVisibleSymbols` (`Reel.ts:435-452`), `getSymbolAt` (`:471-475`),
`getAnchorRow` (`:483-486`), and `placeSymbols`' negative-index encoding (`:1071-1091`) all index by
array position and need zero change. Only *which* wrap branch fires flips with polarity.
(`_computeSymbolZIndex` also indexes by array position but is **not** unaffected — see §6.3.)

`SpinningMode` becomes:

```ts
computeDelta(slotPitch: number, speed: number, deltaMs: number): number;  // signed travel
```

### 3.3 Screen-space inputs stay screen-space

This is the scope limiter that keeps the change tractable, and the reason the breaking surface is a
rename list rather than a rewrite. The axis derives its scalars:
`mainCellSize = orientation === 'vertical' ? height : width`.

**Unchanged, screen-space:** `symbolSize(width, height)` · `symbolGap({x, y})` ·
`ReelSymbol.resize(width, height)` · `CellBounds {x, y, width, height}` · `Position {x, y}` ·
`ReelSet extends Container` positioning · all of `spotlight/`, `wins/`, `pool/`, `speed/`,
`events/EventEmitter`, `utils/`.

**Third-party `ReelSymbol` subclasses keep working unmodified.** Verified file by file: `ReelSymbol`
(`playDestroy` pivots to `getLocalBounds()` centre, `:153-220`), `SpriteSymbol` (`playWin` uniform
`1.15` scale `:43-56`; `resize` `:63-66`), `AnimatedSpriteSymbol` (`:78-86`, symmetric anchor math),
`SpineSymbol` (`:167-176`), `SpineReelSymbol` (`:390-398`), `EmptySymbol`. Nothing under `symbols/` or
`spine/` carries an axis assumption. That is the single largest de-risking fact in this proposal: the
extension point most consumers actually use does not move.

**`MaskStrategy` is the exception, and it is a real one — see §6.5.**

**Renamed, index/semantic space:** rows → cells, above/below → start/end, heights → extents. §5.

### 3.4 Buffers are geometric, not direction-relative

`bufferAbove`/`bufferBelow` → `bufferStart`/`bufferEnd`, where **start = smaller main coordinate**
(above for vertical, left for horizontal) *independent of travel direction*.

The alternative (`lead`/`trail`, relative to travel) was rejected: buffer symbols are a *presentation*
feature — the coin peeking above the top row, a big symbol's tail parked off-window
(`ColumnTarget.ts:17-23`). Their contract is "the slot just outside the visible top edge." Tying that
to direction means flipping a reel silently teleports every teaser to the opposite edge. Keeping
buffers geometric and motion directional is the whole point of the separation.

It also keeps the negative-index legacy encoding coherent (negative = before the window = smaller
coordinate) across all four combinations — which matters, because that encoding is threaded through
`Reel.placeSymbols:1071-1091`, `FrameBuilder:155-163`, `StopPhase:138-144`, `CascadePlacePhase:50-69`,
`SpinController:1501-1539`, and `BoardGrid:199-204`.

**Consequence, and it is real:** the strip wraps symbols through the *exit-edge* buffer, which is why
`bufferSymbols({below: 0})` is tumble-only today (`ReelSetBuilder.ts:519-525`). With per-spin direction
override, either edge can become the exit edge. v2 therefore requires **both** buffers ≥ 1 unless the
set is tumble-only *and* declares no direction overrides — validated at `build()` with a message that
names which feature forced it.

### 3.5 Direction, per reel and per spin

```ts
builder.orientation('vertical')            // ReelSet-level, immutable after build
       .direction('forward')               // default for every reel
       .directionPerReel(['forward', 'reverse', 'forward', 'reverse', 'forward'])
```

```ts
reelSet.spin({ direction: 'reverse' });               // all reels, this spin only
reelSet.spin({ directionPerReel: [/* ... */] });
```

Applied in `StartPhase.onEnter`, **only from rest**. At rest the strip is symmetric, so flipping
polarity changes exactly one thing that is not already derived: **z-stacking**, if it is polarity-derived
(§6.3). The `StopSequencer` feed edge needs no re-arming at start — its only caller is
`Reel.setStopFrame` (`Reel.ts:419-420`), invoked by `SpinController` during the *stop* sequence, so the
edge is simply read off the reel's axis at `setFrame` time (§6.1).

Mid-spin polarity change **throws** — fail loud, per CLAUDE.md. A true mid-spin reversal tease is a
separate later operation (`reel.reverse()`): decelerate to zero, flip, re-accelerate. That is what the
effect looks like on real cabinets anyway, and it reuses `StartPhase`/`SpinPhase` rather than inventing
a mid-motion strip rebuild.

### 3.6 Gravity is independent of direction

```ts
builder.tumble({ gravity: 'auto' })   // 'auto' (follow reel direction) | 'forward' | 'reverse'
```

`CascadeFallPhase`'s `fallDistance = (visibleRows + bufferBelow + 1) * cellHeight` (`:102-103`)
generalizes to "clear the mask using the buffer on the *gravity exit* edge." `tumbleAlgorithm`'s
"survivors pack toward the bottom, new symbols enter from above" (`:61-95`) becomes "pack toward the
gravity-exit edge, feed from the gravity-entry edge" — identical arithmetic, renamed.

---

## 4. Public API sketch (v2.0.0)

```ts
const reels = new ReelSetBuilder()
  .orientation('horizontal')
  .direction('reverse')                 // scrolls right→left, the old HorizontalReel default
  .reelCount(1)
  .visibleCells(4)
  .symbolSize(72, 72)                   // still screen-space width, height
  .symbolGap({ x: 4, y: 0 })
  .bufferSymbols({ start: 1, end: 1 })
  .symbols(r => r.register('cherry', SpriteSymbol, { texture }))
  .weights({ cherry: 10 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

await reels.spin();
reels.setResult([{ visible: ['A', 'B', 'C', 'D'], bufferStart: ['COIN'] }]);
```

That replaces the entire `horizontal/` subtree — and this one has anticipation, spotlight, pins,
hold-and-win, nudge, weighted RNG, speed profiles, `runCascade` chains, the watchdog, and
`__PIXI_REELS_DEBUG`.

```ts
new ReelSetBuilder().orientation('vertical').direction('reverse')   // roll-up
.directionPerReel(['forward','reverse','forward','reverse','forward'])  // alternating columns
await reels.spin({ direction: 'reverse' });                         // one reversed spin
```

---

## 5. Rename table (the breaking surface: ~45 entries)

### Core geometry

| v1 | v2 | Where |
|---|---|---|
| `visibleRows`, `visibleRowsPerReel` | `visibleCells`, `visibleCellsPerReel` | builder, `ReelGridConfig`, `Reel`, debug snapshot |
| `bufferSymbols({above, below})` | `bufferSymbols({start, end})` | builder |
| `ColumnTarget.bufferAbove` / `.bufferBelow` | `.bufferStart` / `.bufferEnd` | `frame/ColumnTarget.ts:9-37` |
| `Reel.bufferAbove` / `.bufferBelow` | `.bufferStart` / `.bufferEnd` | `core/Reel.ts:352` |
| `reelPixelHeights` | `reelExtents` | builder, `ReelGridConfig` |
| `reelAnchor: 'top'\|'center'\|'bottom'` | `'start'\|'center'\|'end'` | `config/types.ts:207` |
| `Reel.reelHeight` / `.offsetY` | `.extent` / `.mainOffset` | `core/Reel.ts:375-377`, `:380-382` |
| `Reel.symbolHeight` / `.spinSymbolHeight` | `.cellPitchSize` / `.spinCellSize` | `core/Reel.ts` |
| `Reel.reshape(visibleRows, symbolHeight, bufferAbove, bufferBelow)` | `.reshape(visibleCells, cellSize, bufferStart, bufferEnd)` | `core/Reel.ts:1109-1114` |
| `ReelMotion.reshape(symbolHeight, symbolGapY, bufferAbove, visibleRows, bufferBelow)` | axis-relative equivalents | `core/ReelMotion.ts:96` — **and it must read the cross-axis gap under horizontal**, see §6.6 |

### Motion

| v1 | v2 | Where |
|---|---|---|
| `ReelMotion.displace(deltaY)` | `.advance(travelDelta)` | `ReelMotion.ts:53` |
| `ReelMotion.slotHeight` | `.slotPitch` | read at `Reel:404`, `ReelSet:1576/1667/2237/2263`, `CascadeFallPhase:98`, `CascadeDropInPhase:95` |
| `ReelMotion.getRowY(row)` | `.getCellMain(cell)` | `ReelMotion.ts:81` |
| `ReelMotion.setToTopPosition()` | `.parkOutsideWindow(edge)` | `ReelMotion.ts:74` — **signature change, not a rename**, see §6.4 |
| wrap callback `'up'\|'down'` | `'toStart'\|'toEnd'` | `ReelMotion.ts:32` (argument is currently dead at the consumer) |
| `SpinningMode.computeDeltaY(symbolHeight, …)` | `.computeDelta(slotPitch, …)` | `spin/modes/SpinningMode.ts:17` |
| `NudgeOptions.direction: 'up'\|'down'` | `'forward'\|'reverse'` | `core/Reel.ts:47`, `nudge:*` payloads |

### Grid coordinates and payloads

| v1 | v2 | Where |
|---|---|---|
| `SymbolPosition.rowIndex` | `.cellIndex` | `config/types.ts:322` — also reaches `Win.cells` (`:342`, `ReadonlyArray<SymbolPosition>`), spotlight, `WinPresenter` |
| `SymbolData.size {w, h}` | `{reels, cells}` | `config/types.ts:203` — w spans columns, h spans rows; they are not interchangeable, so name them |
| `ReelSet.getSymbolFootprint → {anchor:{col,row}, size:{w,h}}` | `{anchor:{reel,cell}, size:{reels,cells}}` | `ReelSet.ts:1510-1511` — **must move with `SymbolData.size` or v2 ships two incompatible `size` shapes** |
| `ReelSet.pin/unpin/getPin/setSymbolAt(col, row, …)` | `(reel, cell, …)` | `ReelSet.ts:1163, 1705, 1751, 1771` |
| `CellPin.row` / `.originRow`, `CellCoord.row` | `.cell` / `.originCell` | `pins/CellPin.ts:42-57, 115-119` |
| `pin:migrated {fromRow, toRow}` | `{fromCell, toCell}` | `events/ReelEvents.ts:123-126` |
| `pin:moved from:{col,row}` | `{reel, cell}` | `events/ReelEvents.ts:113` |
| `cascade:*` `rowIndex`, `offsetRows`, `winnerRows` | `cellIndex`, `offsetCells`, `winnerCells` | `events/ReelEvents.ts:144-335` |
| `cascade:chain:*` `winners:{reel,row}[]`; `cascade:destroy:*` `cells`/`failed:{reel,row}[]` | `{reel, cell}[]` | `ReelEvents.ts:291, 305, 318, 333-334` |
| `'symbol:created': [symbolId, row]` | `[symbolId, stripIndex]` | `ReelEvents.ts:409` — the arg is the strip array index, not a visible row; fix the lie while renaming |
| `TumbleConfig.rowStagger` / `.rowOrder: 'bottomToTop'\|'topToBottom'` | `.cellStagger` / `.cellOrder: 'endFirst'\|'startFirst'` | `cascade/TumbleConfig.ts:20-36` |
| `DropOffset.originalRow` / `.offsetRows` | `.originalCell` / `.offsetCells` | `cascade/tumbleAlgorithm.ts:25-39` |

### Board and offsets

| v1 | v2 | Where |
|---|---|---|
| `HoldAndWinBuilder.stagger((col, row) => …)`, `HoldAndWinBoard.stagger` | `(reel, cell)` | `HoldAndWinBuilder.ts:30, 100`, `HoldAndWinBoard.ts:32` |
| `BoardCell {col, row}`, `HwCell {col, row}` | `{reel, cell}` | `BoardGrid.ts:16`, `HwTypes.ts:10` |
| `OffsetXMode`, `TrapezoidConfig.topWidthFactor` / `.bottomWidthFactor` | `CrossOffsetMode`, `.startFactor` / `.endFactor` | `config/types.ts:274-290`, `frame/OffsetCalculator.ts:49-53` |

### Deletions

`HorizontalReel`, `HorizontalReelBuilder`, `HorizontalReelConfig`, `HorizontalDirection`,
`HorizontalReelEvents` (`src/horizontal/**`, `index.ts:136-146`).
`MotionBlurOptions.axis` stops being required for horizontal — auto-derived from the reel's
orientation, explicit override retained (`SpinTextureCache.ts:19-40`).

**Deliberately not renamed:** `reelCount`, `reelIndex`, `symbolWidth`/`symbolHeight`,
`symbolGap {x, y}`, `SpinResult.symbols[reelIndex][cellIndex]` (grid indices, not screen),
`getCellBounds`, every event *name*, every `speed/` API, all of `symbols/`.
`getBlockBounds` keeps its name but see §6.7 — its w/h→width/height mapping inverts.

---

## 6. The seven things that will actually bite

Everything else is mechanical. These are not.

### 6.1 `StopSequencer` consumption order

`core/StopSequencer.ts:1-14` states the contract in prose: it hands frame entries back **from the end
first, because new symbols arrive at the top of a reel scrolling downward**. `next()` (`:26-32`)
decrements a cursor. There is no pixel math and no type constraint — which is exactly why it is
dangerous. Get it wrong and the reel lands a correct-looking frame in reverse order, silently.
`setFrame(frame, feedEdge)`, head-first when `feedEdge === 'end'`. Dedicated test per
(orientation × direction).

### 6.2 The negative-index buffer encoding

`columnTargetToArray` (`ColumnTarget.ts:45-60`) encodes buffer-start slots as **negative string
properties** on an array, surfacing in six subsystems (§3.4). §3.4 fixes the *semantics*; every one of
those call sites still needs re-reading, and `BoardGrid.ts:199-204` builds the encoding by hand.

### 6.3 z-index stacking

`Reel._computeSymbolZIndex = base * 100 + arrayIndex` (`:1170-1173`) — "bottom-row symbols render in
front." Under reverse polarity you almost certainly want the opposite; under horizontal, the
`container.zIndex = reelIndex` "rightmost reel draws on top" rule (`:304`) becomes "bottom reel on top,"
which may not be what the art wants. **Derive the default from polarity, expose
`cellStacking: 'ascending'|'descending'` and `reelStacking` as explicit overrides.** This is the one
decision here that is an art call, not an engineering call — get a designer to lock the default.

### 6.4 `setToTopPosition` is a behaviour flip, not a rename

`ReelMotion.ts:74-78` parks the whole strip past `_minY = -(bufferAbove + 1) * slotHeight` — the
*start* edge, using the *start* buffer. Under `gravity: 'reverse'` (§3.6) the cascade strip must park
past `_maxY` using the end buffer. So it takes an edge argument and both `_minY`/`_maxY` become
`_minMain`/`_maxMain` with edge-selected reads. Same class of trap as §6.1: prose contract, no types.

### 6.5 `MaskStrategy` semantics drift silently

`MaskStrategy` is a public extension point (ADR-014). `ReelMaskRect` binds `x` to `reel.container.x`,
`y` to `reel.offsetY`, `height` to `reel.reelHeight` (`ReelViewport.ts:9-16`) — two of which §5 renames.
A third-party strategy written against "one rect per reel column, height = the visible window" receives
an **identically-shaped struct with transposed meaning** under horizontal: no type change, no compile
error, no version signal. Given §10.5's no-silent-aliases stance, this is the one semantic drift the
proposal would otherwise ship on purpose. Fix: version the interface (`MaskStrategy2` taking
`(rects, extents, axis)`), or make `ReelMaskRect` carry the axis so a strategy can branch. Also update
the JSDoc at `ReelViewport.ts:49-52` and `:80-88`, which tells the column-clipping story in
vertical-only terms, and the hardcoded `"and symbolGap.x > 0"` console string at `ReelSetBuilder.ts:696-698`.

Related: the `SharedRectMaskStrategy` auto-pick keys on `symbolGap.x > 0` (`ReelSetBuilder.ts:688`,
`config/types.ts:188-194`) because x is the *cross* axis. Under horizontal it must key on `symbolGap.y`.
Miss it and cross-reel big symbols get striped by the per-reel mask — a bug that only appears with big
symbols plus gaps, i.e. late.

### 6.6 MultiWays reshape reads the gap by name

`Reel.reshape` (`:1147-1148`) computes `_reelHeight = rows * cellH + (rows-1) * _symbolGapY`, and
`ReelMotion.reshape` (`:96-103`) takes `symbolGapY` positionally. Under horizontal both must read the
X gap. AdjustPhase drives this path on every MultiWays spin; it is PR 9's real content and it is not a
`mainProp` swap.

### 6.7 `getBlockBounds` and the big-symbol coordinator

`ReelSet.ts:1594-1599` maps `size.w → width` and `size.h → height`. §7 asserts a 2×2 stays 2 reels ×
2 cells in every orientation, so under horizontal `size.reels` spans screen *height* and `size.cells`
spans screen *width* — the public screen-space return inverts even though the method name doesn't move.
Same for the block-fit assertion at `ColumnTarget.ts:21`.

Worse: `SpinController._coordinateBigSymbols` reads `bufferAbove`/`bufferBelow` off `this._reels[0]`
(`:1506-1507`) with an explicit comment (`:1518-1525`) warning that per-reel buffer variation breaks the
validator loop. §3.5's `directionPerReel` means reels in one set can have **different feed edges** while
that loop still validates every column against reel 0's geometry and one global "negative = above"
convention. **Either big symbols and `directionPerReel` are mutually exclusive in v2 (throw at build),
or the coordinator becomes per-reel.** Pick one before PR 10; do not leave it implicit.

---

## 7. Feature compatibility

**Free — index-based, works once the geometry accessors go through the axis:**
`SpeedManager` and presets · anticipation (`AnticipationPhase`, `anticipationRecipes`) ·
`SymbolSpotlight` (fully isotropic — promotes via `getGlobalPosition`/`toLocal`, `:127-177`) ·
`WinPresenter` · `FrameBuilder` + middleware · `RandomSymbolProvider` · `ObjectPool` · `SpinOptions`
watchdog/`AbortSignal`/`holdReels` · `ImmediateMode` · `SpinPhase` · `PhaseFactory` · all of
`symbols/` · `testing/FakeTicker`, `HeadlessSymbol`.

**Free and *better* — the bounce overshoots in the direction of travel without special-casing:**
`StopPhase` → `{[axis.mainProp]: base + axis.polarity * bounceDistance}`.

**Mechanical port through `axis.mainProp` / `slotPitch`:**
`CascadeFallPhase` · `CascadePlacePhase` · `CascadeDropInPhase` · `AdjustPhase`'s pin-overlay squash
(`scale.y` → `scale[mainProp]`) · `Reel.nudge` (the direction branches at `:813-826`, `:895-930`,
`:943-968`, `:1009-1022` collapse to one polarity multiply) · `Reel._placeSymbolView` / `_toReelLocalY` /
`_setupSymbolPositions` · `ReelSet._pinOverlayCellY` · `ReelSetBuilder` geometry (`:540-573`,
`:658-660`, `:740-763`).

**Not mechanical, despite looking it:**
`Reel._syncUnmaskedViewOffsets` (`:1321-1330`) does `view.x = container.x` (absolute, cross) but
`view.y += container.y` (incremental, main) — two different operations selected by orientation, not one
property swap. Its early-return guard (`:1322`) also stops short-circuiting under horizontal, where
`container.y` is the reel-marching offset and is nonzero for every reel > 0.

`ReelSet.movePin` (`:1863-1866, 1881-1882`) takes the main coordinate from `getSymbolAt(row).view.y` —
bare reel-local, **no `container.y`** — while `_pinOverlayCellY` (`:2144-2145`) adds it. On any layout
with nonzero `offsetY` these two already disagree, and for `unmask: true` symbols `view.y` already has
`container.y` baked in by `_placeSymbolView` (`:1286`), so the flight symbol starts double-offset. **Fix
this before recording golden masters (§10.1), or the baseline freezes the bug onto a second axis.**

**Needs a decision, not a port:** z-stacking (§6.3) · buffer minimums under per-spin reversal (§3.4) ·
big symbols vs `directionPerReel` (§6.7) · `MaskStrategy` versioning (§6.5) · `OffsetCalculator`'s
trapezoid, which computes a *cross* offset as a function of *main* index (`:49-53`) and so generalizes
exactly — but "perspective" under horizontal means the strip funnels vertically toward its ends. Ship
it, rename the config, don't polish it.

**Needs new code:** `debugGrid()` must transpose for horizontal (`debug.ts:90-113` renders columns L→R,
rows T→B); `DebugReelSnapshot.allSymbols[].y` → `.main` (`:28-34, 53-57`).

**Unlocked for free:** Hold & Win boards whose cells spin horizontally (`BoardGrid` builds 1×1
`ReelSet`s, `:130-148`) · roll-up · mixed direction per reel · per-spin reversal teases · drop-in mode
becomes just a `SpinningMode` on any axis.

**Explicitly out of scope:** mixed *orientation* within one `ReelSet` — compose two `ReelSet`s under a
shared stage instead (ADR 017 §B) ·
diagonal or radial motion · cluster grids (ADR-007) · making `SymbolData.size` orientation-relative.

---

## 8. Alternatives rejected

**A. Rotate or flip the container.** `rotation = -π/2` (or `scale.y = -1`) on the strip container, with
each symbol counter-transformed. Tiny internal diff. Rejected as a category error — it changes **facing**
to fix **travel** (ADR 017 §A). Concretely: breaks the `SpriteSymbol` `(0,0)` anchor
vs `SpineSymbol` centering contract, inverts filter and blur orientation, breaks the unmask lift into
`viewport.unmaskedContainer`, and every third-party `ReelSymbol` renders sideways or mirrored. The
counter-transform bookkeeping exceeds the projection it avoids.

**B. Keep duplicating classes.** The status quo extended to `VerticalReel`/`HorizontalReel`/
`ReverseReel`. Rejected on evidence: the existing duplicate is missing 44 of 46 events after two
releases, and the matrix is 2 orientations × 2 directions × every future feature.

**C. Generic `Vec2` math everywhere.** Rejected: per-frame allocation on the hot path, and it doesn't
solve the actual hard problem — GSAP tweens are built from **property names**, not vectors.

**D. Axis projection with screen-space public inputs.** ← chosen.

**E. Rewrite as a general grid engine, dropping the reel concept.** Rejected — ADR-007 already scoped
cluster grids out, and it discards the strip/wrap machinery that is the library's actual value.

---

## 9. Rollout — 12 PRs, only two are breaking

`ROADMAP.md:31` defers this as a "core-motion refactor, high regression risk to the vertical path."
That framing is wrong in one important way: **most of this refactor is behaviour-preserving and can
ship as 1.7.x patches.** The breaking part is a rename commit at the end.

| # | PR | Breaking | Notes |
|---|---|---|---|
| 0 | Fix `movePin` / `_pinOverlayCellY` offset disagreement | no | must precede baselines (§7) |
| 1 | Add `ReelAxis` + `VERTICAL_FORWARD`, unused | no | pure add |
| 2 | Golden-master trace harness; non-square `testHarness` default; record v1 baselines | no | §10 |
| 3 | `ReelMotion` → travel coordinates, axis-injected | no | baselines must not move one pixel |
| 4 | `Reel` position writes through the axis | no | incl. the `_syncUnmaskedViewOffsets` asymmetry |
| 5 | `SpinningMode.computeDelta` | no | also fix `CascadeMode`'s full-slot clamp, §10.6 |
| 6 | Phases via `axis.mainProp` (Start pull, Stop bounce, Adjust squash) | no | GSAP computed keys |
| 7 | Cascade phases + `tumbleAlgorithm` on the gravity axis; `parkOutsideWindow` | no | §6.4 |
| 8 | Builder geometry: cross-axis marching, mask rects, viewport extents, mask auto-pick; **`ReelSetBuilder.viewport(existing)`** | no | §6.5; ADR 017 §B.4 |
| 9 | `ReelSet` geometry accessors, pin overlays, MultiWays reshape gap axis; **hoist `_stopDelayFor` into an injectable `StopScheduler`** | no | §6.6; ADR 017 §B.4 |
| 10 | **Vocabulary rename + codemod + loud throws; `MaskStrategy` v2; big-symbol/`directionPerReel` decision; `SymbolPosition` gains optional `setId`** | **yes** | the v2.0.0 commit. `SymbolPosition` breaks here anyway (`rowIndex → cellIndex`) — adding `setId` now is free, later it is a second break. ADR 017 §B.3 |
| 11 | **Enable `orientation: 'horizontal'`; port both recipes; delete `src/horizontal/`** | **yes** | 747 lines removed |
| 12 | Debug transpose, docs, this ADR to Accepted | no | |

PRs 3–9 each satisfy the one-logical-change rule and land under ~300 lines of real change.
PR 10 is large by definition but mechanical and codemod-generated.

Rough size: ~1,500–2,000 lines of real change against ~15.9k lines of `src` (68 files), plus ~1,000
lines of new tests and the codemod. **[unverified — estimate]** The hard-coupled surface is
concentrated: `ReelMotion` (132 lines, ~100%), `Reel` (~400 of 1,594), `ReelSet` (~250 of 2,320),
`ReelSetBuilder` (~120 of 896), phases (~450), `cascade/` (~150). Everything else is renames.

---

## 10. De-risking — the load-bearing section

The repo already has the right tooling and does not use it for this. `testing/testHarness.ts` +
`FakeTicker` + `HeadlessSymbol` make the engine deterministic and headless; there are 59 unit and 21
integration test files, plus `tests/e2e/` (currently one Playwright spec).

**10.1 Golden-master position traces.** Before PR 3, record a per-frame trace of every symbol's
`(x, y)`, array index, symbol id, and every emitted event, across a scenario matrix: uniform 5×3,
pyramid `3-5-5-5-3`, MultiWays with reshape, tumble chains, big symbols, unmask, pins, nudge, skip at
each stage, anticipation. PRs 3–9 must reproduce them byte-identically with
`orientation: 'vertical', direction: 'forward'`.

Two caveats that decide whether this gate is trustworthy:

- **A golden master freezes bugs as well as behaviour.** `movePin`'s offset disagreement (§7) is a known
  one; hence PR 0. Audit for others before recording, and mark any deliberately-frozen wrong value in
  the fixture.
- **`playDestroy` writes `view.x`/`view.y` directly** (`ReelSymbol.ts:168-169, 184, 219`) — a documented
  exception to the never-mutate-Y invariant. It restores them, but mid-implode frames are the least
  deterministic thing in the matrix. Either drive it from `FakeTicker`-synced GSAP or exclude
  destruction frames from the byte-identical gate and assert start/end states only.

**10.2 `testHarness.ts:88` defaults `symbolSize` to `{width: 100, height: 100}`.** Square — **today's
tests structurally cannot catch an axis swap.** Change it to non-square (e.g. `120 × 100`) as the first
commit of PR 2, before anything else. It will probably fail some existing tests; those failures are
information.

**10.3 Isomorphism tests.** For each vertical trace, run the identical scenario with
`orientation: 'horizontal'` and assert the trace equals the vertical one with x/y and the grid
transposed. This machine-checks the generalization rather than sampling it, and is only possible
because the harness is headless.

**10.4 Mirror tests.** `direction: 'reverse'` traces must be the `forward` traces reflected about the
strip's main-axis center, with the `StopSequencer` consumption order reversed. Note that wrap
transitions are **not** observable as events today (§2) — the mirror test must assert on the symbol
array's rotation state directly, or PR 3 must promote wraps to a real event. Without one of those, this
test does not cover §6.1, which is the thing it exists to cover.

**10.5 Facing invariant test.** Across all four travel combinations, at every lifecycle stage: assert
`view.rotation === 0` for every symbol, and that `resize()` was called with screen-space
`(width, height)`. This is the test that catches someone "fixing" horizontal by rotating the container
(§8 Alternative A). See ADR 017 §A.

**10.6 Playwright visual diffs** on `classic-spin`, `cascade-tumble`, and both horizontal recipes, at
each of the four orientation/direction combinations.

**10.7 Two latent bugs this refactor surfaces — fix them separately, with their own tests.**
`CascadeMode.computeDeltaY` clamps to a **full** `symbolHeight` (`CascadeMode.ts:22`), while
`ReelMotion` (`:48-52`) and `StandardMode` (`:12-17`) both require **half** a slot to preserve the
at-most-one-wrap-per-call invariant. Currently harmless only because cascade `speed` is never negative
and deltas rarely reach the cap. And `_onSymbolWrapped`'s `direction` and `row` arguments are dead
(`Reel.ts:1352-1378`) — either wire them or delete them, but don't carry a dead direction parameter into
a refactor whose entire subject is direction.

**10.8 Migration ergonomics.** Per CLAUDE.md's fail-loud rule: **no silent deprecated aliases.** Ship
`npx pixi-reels-codemod v1-to-v2` (a jscodeshift transform over §5), and have `build()` throw a named
error on any v1 key it still sees — `"visibleRows was renamed to visibleCells in v2; run npx
pixi-reels-codemod v1-to-v2"`. A quiet alias layer would let a `bufferAbove` that now means something
subtly different reach production, which is the exact failure mode the stability rules exist to prevent.

---

## 11. Consequences

**Positive.** One engine, one set of 46 events, one `SpeedManager`, one cascade implementation for all
four orientation/direction combinations. Three roadmap rows close at once (horizontal, mixed direction
per reel, roll-up); a fourth (drop-in mode) becomes cheap. 747 lines of parallel engine deleted.
`MotionBlurOptions.axis` stops being a footgun. Third-party symbol classes are unaffected.

**Negative.** A real v2 with a ~45-entry rename table, larger than the first draft of this ADR assumed —
the `board/` subtree, `ReelSet`'s pin/cell coordinate API, six event payloads and both `reshape`
signatures all carry `row`. Every consumer runs a codemod. And `row` is deeply embedded in slot-industry
language; `cell` will read oddly to people who only ever build vertical slots. That cost is permanent
and paid by the majority use case to serve the minority one. There is no way around it if the goal is
one engine.

**Neutral but worth naming.** After this, "which way is up" stops being a property of the code and
becomes a property of configuration. That is the point, but the mental model a contributor needs is one
level more abstract than "symbols move down." §2 and §3.2 exist to make that model cheap to acquire, and
should be reproduced in `CLAUDE.md`'s invariants section, replacing "`ReelMotion` wraps via
`_maxY`/`_minY`" with *travel changes motion; facing changes art; they never change each other.*
