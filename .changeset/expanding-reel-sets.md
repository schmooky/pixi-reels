---
'pixi-reels': minor
---

Add: reel sets that grow sideways at runtime, for "infinity reels" style mechanics. `reelSet.addReels(count, { visibleCells, initialFrame })` appends reels after the last one (laid out, masked and pooled like the rest), `reelSet.removeReels(count)` destroys the last ones and gives the memory back, and `reelSet.expand({ columns, step, onAdded, onLanded, anticipation, signal })` runs the whole chain from one server result: add a step's reels, spin only them, land them on their columns, repeat.

```ts
const spin = reelSet.spin();
reelSet.setResult(res.columns.slice(0, 5));
await spin;
await reelSet.expand({
  columns: res.columns.slice(5), // the server decides how many
  step: 1,                       // or 2, or (info) => ...
  onAdded: (step) => camera.panTo(step.reelCount),
  onLanded: (step) => showWays(step.result.symbols),
});
reelSet.removeReels(reelSet.reels.length - 5); // next round starts from five
```

The steps are one round: pin turns and `'eval'` pins are not spent per step, and start and stop delays stagger by a reel's place in its step rather than its index, so reel 40 does not wait forty delays. Skip works a step at a time: `skipSpin()` frees the step in flight (slam or quicken, per `skipMode()`) and boosts the rest of the round once; a press between steps, while a hook runs and nothing spins, carries to the next step instead of being dropped (both `skipSpin()` and `requestSkip()`); a step's reels join a `setReelGroups()` layout as one trailing group; `anticipation` takes `AnticipationOptions`, so a step's tease can be protected from the first press (`{ protect: 'once' }`). Aborting `signal` fast-forwards: everything still to come lands in one step. On a MultiWays set each column's length is that reel's shape, so the ways multiply as the board grows (eight reels of seven cells is 5,764,801 ways). A step that a big symbol would straddle is widened to take the block whole, so a 2-wide block arriving in a one-reel step adds two. Columns, shapes and blocks are validated before the first reel is added.

New events: `reels:added`, `reels:removed`, `expand:start`, `expand:step`, `expand:stepLanded`, `expand:complete`. `Reel.reelCount` follows the board. `SpinMetrics` and `debugOverlay` follow reels added and removed after they were created.

Fix: destroying one reel of a live set no longer destroys the views of symbols it had released to the shared pool, which handed the next acquire a symbol with a dead view.
