---
"pixi-reels": minor
---

Add: `HoldAndWinBuilder.lockAnimation('win' | 'landing' | 'none')` picks what a coin's symbol plays the moment it locks. The default stays `'win'` (the board's existing `playWin()` on `coin:locked`); `'landing'` plays the new `ReelSymbol.playLanding()` land beat only and `'none'` plays nothing, so a board can land every cell quietly and celebrate once. `HoldAndWinBoard.playWin(cells?)` is the explicit celebration: it plays the win on every locked coin (or just `cells`) and resolves when they finish. `ReelSymbol.playLanding()` is a new base-class one-shot that resolves at once by default; `SpineReelSymbol` already implements it with the skeleton's `landing` track.
