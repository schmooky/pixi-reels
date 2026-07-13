---
"pixi-reels": minor
---

Fix: `symbolData` `unmask` is now an at-rest presentation. While the reel spins, unmasked ids stay in the masked reel container like every other symbol — previously they scrolled visibly outside the grid and buffer-row instances sat parked beyond the mask edge, visually breaking the reels. On land, visible-row instances are lifted into the viewport-wide `unmaskedContainer` (above every reel and outside the mask) and handed back to their reel when the next spin starts.
