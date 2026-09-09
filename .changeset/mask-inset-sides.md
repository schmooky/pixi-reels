---
"pixi-reels": minor
---

Add: `inset(strategy, pixels)` takes a per-side trim as well as one number: `inset(new RoundedRectMaskStrategy({ radius: 43 }), { top: 4, bottom: 12 })`. The sides are screen sides in every orientation, an omitted side is untouched, and a negative one grows. Uneven cross-axis sides are split into their symmetric half (through `bleed`, as before) and a shift of the whole mask, so every built-in strategy honours them and curve bleed still composes. Replaces the hand-written `PathMaskStrategy` a game needed for a frame whose top and bottom lips differ.
