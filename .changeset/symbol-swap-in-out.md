---
'pixi-reels': minor
---

Add: `ReelSymbol.playIn()` / `playOut()`, and `reelSet.swapSymbols(...)` — the
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
