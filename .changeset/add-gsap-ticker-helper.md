---
"pixi-reels": minor
---

Add: `driveGsapWithTicker(ticker)` helper that pins GSAP to the PixiJS ticker (and returns a disposer that restores GSAP's own ticker). Encapsulates the one-line incantation every integration had to remember, so engine animations don't freeze in hidden tabs / iframes.
