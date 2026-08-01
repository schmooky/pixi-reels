---
'pixi-reels': minor
---

Add: `debugOverlay` gains the axis-aware layers.

- `axis` draws one arrow per reel along the travel axis, pointing the way it goes.
- `feed` marks the strip edge new symbols arrive at.
- `thresholds` draws the two wrap lines, so contract laws L7 and L9 are watchable: drive a spin and no symbol should ever be drawn past one.
- `hud` now reports orientation, direction and feed edge per reel (`r0 VF feed=start spd=... cells=...`).

Add: `overlay.describe()` returns a plain-JSON summary of what those layers represent, per reel - orientation, direction, feed edge, the arrow's signed main-axis span, the feed marker and both thresholds. PixiJS renders to a canvas that CI and AI agents cannot see; this is the same information in a form `expect` can read. A mirrored arrow has identical bounds, so the signed span is the only thing that can tell a reverse reel from a forward one.

Fixed: the `buffers` and `hud` layers positioned themselves off `container.x` / `mainOffset` directly, so they drew in the wrong place on a horizontal set. Both now project through the reel's axis, as does every new layer. Each layer's `Graphics` carries a `label` (`pixi-reels:debugOverlay:<layer>`) for the Pixi devtools and for tests.
