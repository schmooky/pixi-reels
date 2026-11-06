---
'pixi-reels': patch
---

Fix: 4.3.1 is 4.3.0 published as `latest`. 4.3.0 reached npm under a branch dist-tag instead of `latest`, so `npm install pixi-reels` kept resolving to 4.2.0. The code is the same as 4.3.0; see its notes for the changes.
