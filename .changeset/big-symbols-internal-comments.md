---
'pixi-reels': patch
---

Internal: sharpen comments around the big-symbol coordinator's
uniform-buffer assumption and `_finalizeFrame`'s scan asymmetry — both
were silently load-bearing on contracts that weren't spelled out.
Also extends `ColumnTarget.bufferAbove` / `bufferBelow` JSDoc to
explicitly document the big-symbol anchor capability — discoverable
in IDE tooltips. No runtime change.
