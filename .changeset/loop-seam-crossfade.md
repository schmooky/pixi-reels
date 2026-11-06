---
"pixi-reels": patch
---

Fix: `zvukPort` loops crossfade 30 ms at their seam, so an encoded loop that does not end on a zero crossing, or an AAC loop with a padded tail, no longer clicks or gaps each time it wraps. `ZvukPlayOptions` gains `loopCrossfade`.
