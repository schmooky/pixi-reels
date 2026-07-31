---
"pixi-reels": minor
---

Add: reverse and mixed per-reel travel direction now spin and land correctly on a vertical set. `StopSequencer` feeds the target frame from the direction-appropriate edge (head-first for reverse reels, tail-first for forward), so `direction('reverse')` (roll-up) and `directionPerReel([...])` (alternating columns) land the exact requested grid. Forward reels are unchanged. Horizontal orientation still fails loud until its set geometry lands.
