---
'pixi-reels': minor
---

Added `ReelSet.requestSkip()` (and `SpinController.requestSkip()`) — a slam-stop entry point that's safe to call before `setResult()` arrives. If the result is already pending, it behaves exactly like `skip()`. Otherwise the skip is queued and fires automatically as soon as `setResult()` lands.

Use this from UI handlers in server-driven slots: a player tapping the spin button to slam-stop before the WebSocket response reaches the client no longer snaps every reel onto whatever buffer state happened to be mid-scroll. Existing `skip()` is unchanged.
