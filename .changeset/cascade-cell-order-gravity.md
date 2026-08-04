---
'pixi-reels': minor
---

Fix: the tumble cell stagger now follows gravity, so a reel that drains upward peels and refills from the top instead of the bottom.

`tumble({ fall, dropIn })`'s `cellOrder` resolved against the raw cell index and nothing else. Under the usual downward gravity that reads correctly -- the bottom cell, the one at the exit edge, goes first -- but on a reel draining the other way it staggered from the cell FURTHEST from the drain, so the cell about to leave first waited for the whole column to clear ahead of it. The geometry was already gravity-correct (symbols travelled and entered through the right edges); only the timing read backwards, which is why nothing caught it. `.direction('reverse')` with the default `gravity: 'auto'` was the visible case.

`cellOrder` now accepts `'auto'` and defaults to it. `'auto'` starts at the gravity-EXIT end -- the edge symbols are settling against -- so the canonical "bottom-left first, top-right last" feel is unchanged for every downward-gravity reel, and inverts by itself when gravity does. Nothing changes for a set that does not override gravity or direction.

`'endFirst'` and `'startFirst'` keep their meaning and are now explicitly geometric, like the buffers (ADR 016 section 3.4): they name an end of the strip and ignore gravity. Pass one to pin a screen edge regardless of which way the board drains.
