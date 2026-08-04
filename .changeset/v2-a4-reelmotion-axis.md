---
"pixi-reels": patch
---

Refactor: `ReelMotion` now projects through a `ReelAxis` and derives symbol positions from array index (and rotation count from total travel) instead of accumulating deltas. Behavior is unchanged for the default vertical/forward axis; the derive model also fixes a latent float-residue wrap-skip at exact N-slot travel (motion contract L7). Internal - the axis defaults to vertical/forward, so callers are unaffected.
