---
"pixi-reels": patch
---

Fix: `CARD_DECK` entries carry an optional `textColor`, so a deck spread together with `WILD_CARD` reads `card.textColor` without a type error.
