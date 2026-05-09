# Spin Lifecycle

A walkthrough of what happens between `reelSet.spin()` and `spin:complete`, including
- the phase chain each reel walks through,
- the exact moment every spin event fires,
- pin-overlay creation/destruction timing,
- how `spin({ holdReels })` reshapes the chain.

This is the document you want when you're debugging a "why didn't my listener fire"
or "why is my pin overlay still on screen" problem.

---

## 1. The phase chain — at a glance

Every reel walks through a chain of `ReelPhase` instances, in order:

```
                     per-reel:
spin() --> START --> SPIN --> [ANTICIPATION] --> [ADJUST] --> STOP --> IDLE
                                                  ^             |
                                              MultiWays    bounce + land
                                              only
```

`ANTICIPATION` is inserted only on reels listed in `setAnticipation([...])`.
`ADJUST` is inserted only on MultiWays slots, between SPIN and STOP, after the geometry has been committed.

Each phase has a default but is replaceable via `builder.phases(f => f.register('start', MyStartPhase))`.

### Cascade variant

For cascade slots (configured via `builder.cascade(...)`), the chain is shorter:

```
spin() --> [CASCADE_ANTICIPATION] --> DROP_STOP --> IDLE
```

There is no separate START / SPIN — the column is stationary, and `DropStopPhase`
handles fall-out + drop-in in one phase.

---

## 2. When each spin event fires

```
TIME ----------------------------------------------------------------->

spin() called
|
+-- (sync) spin:start                                     [ReelSet]
|
|   each reel begins START phase (staggered by spinDelay)
|
|   reel 0 finishes START --> notifies via reel.events --+
|   reel 1 finishes START --+                            |
|   reel 2 finishes START --+                            |
|      ... when LAST reel finishes START                 |
|      +---- spin:allStarted -------------------------- [ReelSet]
|
|   all reels are now in SPIN phase
|
+-- setResult(grid) called by your code
|      +---- spin:stopping --------------------------- [ReelSet]
|
|   each reel:
|     - runs through the rest of SPIN consuming target frames
|     - optionally enters ANTICIPATION on hot reels
|     - lands via STOP (snap, bounce)
|     - emits spin:reelLanded (per reel)            --- [ReelSet]
|
|   when LAST reel lands:
|      +---- spin:allLanded ------------------------- [ReelSet]
|
|   await spin() resolves
|      +---- spin:complete -------------------------- [ReelSet]
|
+-- (async) the spin() promise yields a SpinResult
```

Important corollaries:

- **`spin:stopping` only fires on natural stop**, not slam-stop.
  `skip()` skips this event and goes straight to per-reel `landed` notifications.
- **`spin:allStarted` is synchronous-after-async** — it fires on the same
  microtask as the last START phase's `_complete()`, but staggered start delays
  mean it can be hundreds of milliseconds after `spin:start`.
- **`spin:reelLanded` fires once per reel** even on slam-stop. `spin:allLanded`
  fires exactly once per spin. `spin:complete` always fires last.
- **Held reels do not emit any of `spin:stopping`, `spin:reelLanded`, or any
  per-reel phase events for the held reel** — they're skipped (see section 4).

---

## 3. Pin overlays — creation / destruction timeline

A "pin overlay" is the visual that keeps a pinned symbol on screen while the
underlying reel scrolls during a spin. It's a pooled `ReelSymbol` parented to
`viewport.unmaskedContainer` at the pin's cell coordinates.

```
TIME ----------------------------------------------------------------->

reelSet.placePin({ col, row, symbolId }) called pre-spin
|      +- pin enters internal map; NO overlay yet (reel is at rest)
|
spin() called
|   spin:start fires
|      +- for every active pin:
|           - acquire a fresh overlay symbol from the factory
|           - position at (col, row) in viewport-local coords
|           - parent to viewport.unmaskedContainer
|           - zIndex = PIN_OVERLAY_Z_INDEX (10000)
|
|   reels spin underneath; overlay sits at fixed cell, mask-pierced
|
|   [if MultiWays slot reshapes mid-spin]
|      +- AdjustPhase tweens overlay from old cell --> new cell
|
|   spin:allLanded fires
|      +- for every overlay: release back to factory, clear from
|         viewport.unmaskedContainer
|
spin:complete fires (overlays are already gone by this point)
```

So the overlay's lifetime is exactly **`spin:start` --> `spin:allLanded`**.
If you call `placePin` mid-spin, the overlay is created immediately. If you
call `unpin` during a spin, the overlay is destroyed immediately and the pin
is removed from the map.

For MultiWays reshape, the overlay's pre-/post-reshape positions are computed
by `SpinControllerHooks.buildPinOverlayTweens` BEFORE `_applyReshape` mutates
geometry, so the tween's `from` reflects what the player actually saw.

---

## 4. `holdReels` — selective spin

`spin({ holdReels: [i, j, ...] })` opts the listed reels OUT of the entire
spin chain — they keep their current visible frame and emit no per-reel events.

What happens for a held reel:

| Phase / event              | Held reel  | Spinning reel      |
|----------------------------|------------|--------------------|
| START phase                | skipped    | runs               |
| SPIN phase                 | skipped    | runs               |
| ANTICIPATION (if listed)   | skipped    | runs               |
| STOP phase                 | skipped    | runs               |
| `spin:reelLanded`          | **not fired** | fired           |
| frame from `setResult`     | ignored    | applied            |
| `setStopDelays[i]` value   | ignored    | applied            |

What still happens:

- `spin:start`, `spin:allStarted`, `spin:allLanded`, `spin:complete` still fire
  at the ReelSet level.
- The `SpinResult` returned from `await spin()` includes the **full grid** —
  held reels just contribute their unchanged visible frame.
- If every reel is held (degenerate `{ holdReels: [0, 1, 2, 3, 4] }` for a
  5-reel slot), `spin:allLanded` fires on the next microtask and the promise
  resolves with the unchanged grid.

What `holdReels` is NOT:

- It is not the same as `setStopDelays([..., 99999])`. A 99-second stop delay
  still spins, still consumes target frames, still emits `spin:reelLanded`
  eventually. `holdReels` skips the spin entirely. See `setStopDelays` JSDoc
  for the distinction.

### Out-of-range indices

Indices outside `[0, reelCount)` are silently filtered. Duplicates are
collapsed. So `spin({ holdReels: [0, 0, -1, 99] })` on a 5-reel set is
equivalent to `spin({ holdReels: [0] })`.

---

## 5. Common questions

**Q: I called `setResult` but `spin:stopping` never fires.**
Either `skip()` was called (slam-stop bypasses `spin:stopping`), or the
spin was already completed. Use `__PIXI_REELS_DEBUG.trace()` to verify.

**Q: `await reelSet.spin()` resolves before my pin overlay is gone.**
The promise resolves on `spin:complete`, which fires AFTER `spin:allLanded`,
which is AFTER overlay destruction. So overlays are gone. If they're still
visible, check that you didn't re-pin in your `spin:complete` handler.

**Q: My listener for `phase:enter` fires twice for some reels.**
That's expected for cascade slots (DropStartPhase + DropStopPhase) or
MultiWays slots (extra AdjustPhase between SPIN and STOP). The
`phase.name` field tells you which phase entered.

**Q: I want to record what the player saw — every spin's start grid + final grid.**
Use the debug frame recorder: `startRecording(reelSet, 'tag')`, run spins,
`stopRecording(reelSet)`, then `getFrames('tag')`. Each frame includes the
trigger event (`spin:start`, `spin:allLanded`, `spin:complete`) and a full
`debugSnapshot`.
