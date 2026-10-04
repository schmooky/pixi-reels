---
'pixi-reels': patch
---

Fix: the symbols a MultiWays reel adds when it grows mid-spin join the spin (`onReelSpinStart(true)`, and the tease hook when the reel is teasing), the way a symbol swapped in mid-spin does. A `StaticSpinSymbol` among them showed its live art in a strip of blurred snapshots until it wrapped.
