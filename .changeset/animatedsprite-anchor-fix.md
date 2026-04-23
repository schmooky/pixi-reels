---
"pixi-reels": patch
---

Fix: Two `AnimatedSpriteSymbol` bugs that only manifest on symbols with non-trivial win animations:

- `resize()` now positions the sprite according to its configured anchor, so `anchor: { x: 0.5, y: 0.5 }` renders the symbol centred in its cell instead of with its centre pinned to the cell's top-left corner (which clipped three quarters of the symbol under the reel mask). `anchor: (0, 0)` — the prior default and only combination that worked — is unchanged.
- `playWin()` now returns the animation to frame 0 (`gotoAndStop(0)`) when the sequence completes, so the idle visible state settles on the neutral base frame. Previously the sprite held its last animation frame indefinitely — fine for symmetric pulses that happen to end where they started, a visible glitch for anything else (AI-generated or keyframe sequences that end mid-action).
