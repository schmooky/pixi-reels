---
"pixi-reels": minor
---

Add: anticipation-aware spin presentation — new `ReelSymbol.onReelAnticipationStart()` lifecycle hook, fired on every strip symbol when its reel enters the anticipation phase (and on symbols installed mid-tease). `StaticSpinSymbol` uses it to crossfade the baked motion blur back to the crisp snapshot, so the slowed tease strip is readable instead of smeared.
