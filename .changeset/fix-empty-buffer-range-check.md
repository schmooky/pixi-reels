---
'pixi-reels': patch
---

Fix: an empty `bufferStart` / `bufferEnd` no longer trips the buffer-range check.

`assertBufferCountsInRange` compared `highestDefinedIndex(entries) >= capacity`, and that helper returns `-1` for "no entries at all". When a reel reports a NEGATIVE capacity -- which happens transiently during a cascade, where the strip is briefly shorter than `bufferStart + visibleCells` -- the test became `-1 >= -4` and threw on a column that specified no buffer entries at all:

```
runCascade(): nextGrid column 0: bufferEnd has a symbol at index -1,
beyond engine bufferSymbols=-4
```

The check only ever ran on `setResult`, where reels are settled and capacity is never negative, so it stayed latent until `refill()` and `runCascade()` began validating their grids in this release. A column that specifies nothing can never have an entry dropped, so it is always in range.
