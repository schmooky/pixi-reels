---
'pixi-reels': minor
---

Add: `CardSymbol`, `CARD_DECK` and `WILD_CARD` ship from the package. A playing-card tile drawn with `Graphics` -- coloured body, glyph fitted to the cell, glyph-only win pulse -- so a prototype runs with no art at all: `import { CardSymbol, CARD_DECK, WILD_CARD } from 'pixi-reels'`. It previously lived in `examples/shared` and could only be copy-pasted.

It uses the reel set's own gsap instance rather than importing gsap, so it is safe under a symlinked workspace.
