---
"pixi-reels": minor
---

Fix: `symbolData` `unmask` is now an at-rest presentation. While the reel spins, unmasked ids stay in the masked reel container like every other symbol — previously they scrolled visibly outside the grid and buffer-row instances sat parked beyond the mask edge, visually breaking the reels. On land, visible-row instances are lifted into the viewport-wide `unmaskedContainer` (above every reel and outside the mask), and re-masked the instant the reel begins to move on the next spin (at the start of the accel ramp, not once it reaches full speed — so a lifted symbol never floats above the mask while the strip scrolls under it).
