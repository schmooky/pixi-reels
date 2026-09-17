---
'pixi-reels': patch
---

Fix: a reel hurried before it reached its stop now asks the stop phase it creates to hurry as well. The press used to reach only the phase active at the time, so a custom stop with a wait of its own (a hold before the slide-in, say) cut that wait when the press came during it and played it in full when the press came earlier. A built-in stop already ran with no delay either way and is unchanged.
