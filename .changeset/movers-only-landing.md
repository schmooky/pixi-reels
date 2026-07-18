---
"pixi-reels": patch
---

Fix: cascade refills notify `onReelLanded()` on MOVERS only. survivors that slid and new arrivals. Untouched survivors (offsetRows 0) no longer replay their landing animation on every cascade stage, which read as the whole board twitching after each pop. `Reel.notifyLanded(landedRows?)` gained an optional visible-row filter (strip-spin landings are unchanged. every visible symbol still lands); the gravity stage of two-stage refills now fires each slid survivor's landing reaction the moment it settles.
