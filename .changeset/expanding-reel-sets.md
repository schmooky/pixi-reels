---
'pixi-reels': minor
---

Add: reel sets that grow sideways at runtime, for "infinity reels" style mechanics. `reelSet.addReels(count, { visibleCells, initialFrame })` appends reels after the last one (laid out, masked and pooled like the rest), `reelSet.removeReels(count?)` destroys the last ones (every added one without a count, back to the board the builder made) and gives the memory back, and `reelSet.expand({ columns, step, onStepAdded, onStepLanded, anticipation, signal })` runs the whole chain from one server result: add a step's reels, spin only them, land them on their columns, repeat.

```ts
const spin = reelSet.spin();
reelSet.setResult(res.columns.slice(0, 5));
await spin;
await reelSet.expand({
  columns: res.columns.slice(5), // the server decides how many
  step: 1,                       // or 2, or (info) => ...
  onStepAdded: () => camera.panTo(reelSet.viewport.maskWidth), // the board's new width
  onStepLanded: (step) => showWays(step.result.symbols),
});
reelSet.removeReels(); // next round: back to the board the builder made
```

The steps are one round: pin turns and `'eval'` pins are not spent per step, and start and stop delays stagger by a reel's place in its step rather than its index, so reel 40 does not wait forty delays. Skip works a step at a time: `skipSpin()` frees the step in flight (slam or quicken, per `skipMode()`) and speeds up the rest of the round once (the fastest profile; a cascade-mode expansion lands its later steps at once, the way one press ends a cascade); a press between steps, while a hook runs and nothing spins, carries to the next step instead of being dropped (both `skipSpin()` and `requestSkip()`); a step's reels join a `setReelGroups()` layout as one trailing group; `anticipation` takes `AnticipationOptions`, so a step's tease can be protected from the first press (`{ protect: 'once' }`). Aborting `signal` fast-forwards rather than cancels: everything still to come lands in one step (`AbortSignal.abort()` lands a whole expansion at once, for quick spin, autoplay and tests). On a MultiWays set each column's length is that reel's shape, so the ways multiply as the board grows (eight reels of seven cells is 5,764,801 ways). A step that a big symbol would straddle is widened to take the block whole, so a 2-wide block arriving in a one-reel step adds two. Columns, symbol ids, shapes, blocks and an `anticipation` object are validated before the first reel is added, so a bad result throws on an untouched board; an `anticipation` function's answer is checked before its step's reels exist. An abort listener never outlives the expansion on the caller's signal, even when the set is destroyed mid-step.

Added reels are built the way the builder built the others: a reel without a count copies the last reel as the board is now, `reelExtents()` boxes and a runtime `setCurve()` carry over, and a `setShape()` still pending lands them at their own shape. A named `setDropOrder('ltr' | 'rtl' | 'all')` now counts over the reels that spin rather than the reel count when it was set, so it covers added reels and orders an `expand()` step by place. `removeReels()` hands the removed reels' symbols back to the pool, which stops any animation still playing on them, and destroys anything a game added to those reels' containers.

New events: `reels:added`, `reels:removed`, `expand:start`, `expand:stepAdded`, `expand:stepLanded`, `expand:complete`. `Reel.reelCount` follows the board. `SpinMetrics` and `debugOverlay` follow reels added and removed after they were created.
