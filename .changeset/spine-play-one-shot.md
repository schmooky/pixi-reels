---
'pixi-reels': minor
---

Add: `SpineReelSymbol.playOneShot(animation, { track, then })`, the awaitable one-shot that `playWin()`, `playLanding()` and `playOut()` are built on. It resolves when the animation completes and leaves the track on the idle loop (`then: 'idle'`, the default on track 0), on its last frame (`'hold'`), or empty (`'clear'`, the default on any other track, so an overlay mixes out and the tracks under it show through). Use it where `playOnTrack(track, name, false)` gave no way to know the one-shot had ended and never went back to idle; `playOnTrack` stays for loops and raw track entries.

```ts
await coin.playOneShot('collect');                   // track 0, then idle
await coin.playOneShot('react_u', { track: 1 });     // overlay, cleared after
await coin.playOneShot('explode', { then: 'hold' }); // stays on its last frame
```

One-shots on different tracks run side by side: each track settles only its own promise, and `stopAnimation()` settles all of them and clears the overlays, including one that ended holding its last frame (`then: 'hold'`). `OneShotOptions` and `OneShotEnd` are exported from `pixi-reels/spine`.

Fix: a `playWin()` / `playLanding()` / `playOut()` promise no longer waits forever when something else takes its track (`playOnTrack()`, a raw `setAnimation()`): it settles the moment its animation is replaced.

Fix: a game's own `spine.state` listener no longer misses the `complete`, `interrupt` or `end` of a one-shot. The symbol listened on the state and removed itself during spine's dispatch, which walks the listener list live, so the listener after it was skipped; it now listens on the one-shot's own track entry.
