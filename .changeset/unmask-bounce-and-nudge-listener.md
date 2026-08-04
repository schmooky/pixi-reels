---
'pixi-reels': major
---

Fix: an `unmask: true` symbol now travels with the reel through the stop bounce instead of hanging still for it.

`StopPhase` lifts landed unmask views into `viewport.unmaskedContainer` in `notifyLanded()` and only then tweens `reel.container` through the two-leg overshoot. A lifted view carries the reel offset in its own coordinate rather than inheriting it from a parent, so it did not follow that tween: on the default profile a landed scatter or wild sat motionless for the full 600 ms while the rest of the reel bounced underneath it. The bounce now keeps lifted views pinned to the reel for every frame, and settles them on the exact resting position rather than the last tween sample.

Skipping mid-bounce had the same fault from the other side. `onSkip()` snapped to grid *before* resting the container, so `snapToGrid` baked the current overshoot position into every lifted view and the container then moved out from under it -- leaving the view off by however far the bounce had travelled. The container is rested first now.

Fix: `nudge({ startDelay })` no longer leaks an `abort` listener per call. The listener was registered with `{ once: true }`, which only self-removes when the event actually fires, so every nudge that completed normally left one behind. The documented staggered pattern -- one long-lived `AbortController` across `Promise.all(reels.map(...))` -- accumulated them for the life of the controller. It is now removed on both paths.

Fix: `StopSequencer.next()` throws when the frame is exhausted instead of returning `_frame[0]`, or `''` after a `reset()`. Both fallbacks handed back a symbol id that resolves to nothing, so an over-consuming caller landed a silently wrong frame rather than failing where the bug was. Every caller already gates on `hasRemaining`. `reset()` also restores the feed cursor and step, not just the frame and count.
