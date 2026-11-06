---
'pixi-reels': patch
---

Fix: debug labels stay sharp when the reels are scaled up. `DebugPlaque` rows and the `debugOverlay` labels re-rasterise at the scale they are drawn, rounded to half steps and capped at 8x. Before this, a host that fitted the reels to a bigger canvas, or zoomed in, showed the text as a stretched bitmap next to the vector plates.
