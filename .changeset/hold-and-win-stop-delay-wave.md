---
'pixi-reels': minor
---

Change: a Hold & Win board's landing wave steps by the active speed profile's `stopDelay`, the way reels stop `stopDelay` apart on a reel set. Each cell spins `(reel + cell) * stopDelay` ms on top of the profile's `minimumSpinTime`, so the wave follows `board.setSpeed()`: a turbo profile with `stopDelay: 0` lands every cell together, and no `stagger` function has to branch on profile names to do it.

The builder's default `'normal'` profile sets `stopDelay: 70`, so a board on defaults keeps its 70 ms wave. A board that registers its own profiles and no `.stagger()` now waves by their `stopDelay`: 140 ms a step on the NORMAL preset, none on TURBO and SUPER_TURBO. To keep the old fixed wave, `.stagger((reel, cell) => (reel + cell) * 70)`.

`HoldAndWinBuilder.stagger(fn)` still replaces the wave, and `fn` now also gets the speed's profile: `.stagger((reel, cell, speed, profile) => reel * profile.stopDelay)` is a column-by-column wave that scales with the speed. Its type is exported as `HwStagger`.
