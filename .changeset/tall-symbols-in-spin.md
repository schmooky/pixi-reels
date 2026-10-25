---
'pixi-reels': minor
---

Add: tall big symbols (one reel wide, several cells high) can carry a weight and stream past during the spin, anchor and covered cells together, so a stacked wild or a 1x3 scatter can tease while the reel is still moving instead of only ever landing.

- Give the block a weight like any other symbol, in `weights()` / `symbolData()` or in a per-reel pool: `builder.randomSymbols({ weights: { TALL: 25 } }, { reel: 0 })` makes reel 0 the only reel it scrolls on. Weights were always per reel through pools; this makes them matter for tall blocks too.
- A block half-way onto the strip when the result arrives finishes before the stop frame starts, so a landing never cuts one in half. The landing comes at most `size.cells - 1` wraps later.
- A big symbol with no weight now defaults to `0` instead of the generic `10`, so an existing registration keeps landing only. Blocks wider than one reel must keep weight `0`: the builder, and `randomSymbols.set()`, throw on a weight for one, since the random fill feeds one reel at a time and cannot coordinate a block across reels.
- A weighted tall block needs `bufferSymbols({ start: size.cells })` or more. The builder and `randomSymbols.set()` throw otherwise: the block enters a forward reel tail first and leaves a reverse reel anchor first, and those buffer slots are where its covered cells sit while the anchor that draws them is off the strip.
- A spin that ends without a result (abort, timeout) rests on a clean strip: the placed cells of a block the feed had not finished are replaced with single cells rather than left as blank cells with no anchor.
- Single-slot draws (`setResult` targets that leave a cell blank, cascade backfill, buffer refills) never return a block; only the strip feed does. The random draw needs at least one 1x1 symbol drawable in every scope, as before.
