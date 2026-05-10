---
'pixi-reels': minor
---

Add a frame-state recorder to the debug module: `startRecording(reelSet, tag)`, `stopRecording(reelSet)`, `getFrames(tag?)`, `clearFrames()`.

Each lifecycle event (`spin:start`, `spin:reelLanded`, `spin:allLanded`, `spin:complete`) captures one `DebugSnapshot` while a recording session is active. Frames are tagged with the string passed to `startRecording`, so multiple sessions can share one global log and be filtered out via `getFrames(tag)`. Per-process buffer is capped at 1000 frames by default (rolling window); override via `startRecording(reelSet, tag, { maxFrames })`. Recording auto-detaches when the reel set emits `'destroyed'`.

Designed for AI agents and debug harnesses that need a frame-by-frame trace of a spin sequence — particularly useful for diagnosing flicker, double-fires, or off-by-one frame issues that aren't visible from a single point-in-time `debugSnapshot`.

Also exposed on `__PIXI_REELS_DEBUG` after `enableDebug(reelSet)`:

```js
__PIXI_REELS_DEBUG.startRecording('my-tag')
await reelSet.spin();
__PIXI_REELS_DEBUG.stopRecording()
__PIXI_REELS_DEBUG.getFrames('my-tag')
```

`startRecording` is idempotent per reel set — calling it twice on the same set replaces the prior session.
