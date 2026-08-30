---
'pixi-reels': patch
---

`setReelGroups()` now documents and enforces its window. A layout may be set any
time up to `setResult()` — including between `spin()` and `setResult()`, so a
round can be grouped from its own server response; the barrier is read as each
reel's SpinPhase resolves, which is exactly when the result lands. Changing the
layout once reels have begun landing throws instead of half-applying: a reel that
already passed the barrier cannot un-pass it, so the new layout would apply to
some reels and not others, silently.
