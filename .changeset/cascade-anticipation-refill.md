---
"pixi-reels": minor
---

Add: two-stage cascade refill (gravity → hold → drop-in) for tumble slots that want an anticipation beat between survivors landing and new symbols entering.

The default refill animates survivors and new symbols together in one beat (the Sweet Bonanza / Sugar Rush feel). A handful of slots split it in two: survivors slide first, a global beat for anticipation visuals (multiplier roll, mascot react, SFX peak), then new symbols enter — often staggered per column. That flavor is now first-class.

Opt in via `mode: 'gravity-then-drop'` on `refill()` (or `refillMode: 'gravity-then-drop'` on `runCascade()`):

```ts
await reelSet.destroySymbols(winners);
reelSet.setDropOrder('ltr', 110);              // per-column wave for stage B

await reelSet.refill({
  winners,
  grid: nextGrid,
  mode: 'gravity-then-drop',
  gravityHoldMs: 350,                          // anticipation window
});
```

New options:

- `refill({ mode })` — `'combined'` (default, unchanged) or `'gravity-then-drop'`.
- `refill({ gravityHoldMs })` — global pause between gravity end and drop-in start. Default `250`.
- `refill({ onGravityComplete })` — awaitable hook between stages; extends the hold for async work (multiplier count-ups, etc.).
- `runCascade({ refillMode, gravityHoldMs, onGravityComplete })` — same options forwarded into every refill in the chain. The hook receives `{ chain, winners }`.

New events:

- `cascade:gravity:start` — `{ reelIndex }`. A reel's gravity stage begins.
- `cascade:gravity:symbol` — same shape as `cascade:dropIn:symbol`, scoped to survivors.
- `cascade:gravity:end` — `{ reelIndex }`. A reel's gravity stage settled.

These fire only in two-stage mode; combined mode is unchanged. Per-column stagger inside the drop-in stage uses the existing `setDropOrder('ltr', stepMs)` — `step < dropIn.duration` gives an overlapping wave, `step >= dropIn.duration` gives strictly sequential columns. The gravity stage always runs all reels in parallel.

See the [Cascade anticipation refill recipe](https://pixi-reels.com/recipes/tumble-anticipation/) for a live example.
