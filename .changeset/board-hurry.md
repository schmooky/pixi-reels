---
'pixi-reels': minor
---

Add: `HoldAndWinBoard.hurry(options?)` and `BoardGrid.hurrySpinning(options?)` - the board's `requestHurry()`. Every in-flight cell lands through its stop instead of being placed: its spin floor drops (the board's stagger lives there, so the whole wave lands together), it spins its symbol in and bounces. `options.speed` names a registered profile the cells land on; an unknown name throws. The board fires `feature:hurry` with the count, the counterpart of `feature:skip`; the landing flow (`cell:landed`, `coin:locked`, `respin:end`) is unchanged and there is nothing for the game layer to cut short.
