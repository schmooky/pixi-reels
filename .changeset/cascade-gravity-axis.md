---
'pixi-reels': minor
---

Add: `tumble({ gravity })` so cascades work on reverse and horizontal reels (ADR 016 section 3.6).

Cascade refills used to be hard-coded to settle toward the larger cell index. On a reel built with `.direction('reverse')` that meant the board drained one way and refilled through the edge it had just emptied, with survivors sliding against the reel's own travel. The two halves disagreed internally too: `distance: 'auto'` applied the reel polarity while the default `'perHole'` did not, so changing one animation-tuning field flipped which edge symbols entered from.

`gravity` defaults to `'auto'`, which follows each reel's own direction, so a reverse or horizontal set now cascades correctly with no extra configuration:

```ts
builder.direction('reverse').tumble({});            // drains upward, refills from below
builder.orientation('horizontal').tumble({});       // drains right, refills from the left
builder.tumble({ gravity: 'reverse' });             // spin one way, drop the other
```

Whichever edge gravity exits by is the edge your server must pack survivors against in the grids it sends -- the engine animates the result, it does not reorder it.

`DropOffset` gains an `isNew` field. Branch on that rather than `originalCell < 0`, which only discriminates under forward gravity. `computeDropOffsets` takes an optional `gravity` and still defaults to `'forward'`.

`createTestReelSet` gains a `tumble` option so a cascade test can pick an orientation and direction without hand-rolling a builder.
