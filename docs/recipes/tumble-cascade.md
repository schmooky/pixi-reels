# Tumble cascade recipe — drop-on-click, gravity refill, cascading multiplier

A tumble slot has two distinct animation moments:

- **Moment A — Spin click.** Existing symbols fall off the bottom of the viewport. The reels sit empty (or show a spinner) while the server responds. New symbols drop in from above.
- **Moment B — Cascade refill.** After a win, the matching cells are cleared. Survivor symbols slide down to fill the gaps below them; new symbols drop into the holes at the top.

The library handles both via three named phases — `cascade:fall`, `cascade:place`, `cascade:dropIn` — wired through `builder.tumble(...)` and four verbs on `reelSet`:

- **`reelSet.spin()` + `setResult(grid)`** — Moment A. Returns a promise that resolves on `spin:complete`.
- **`reelSet.destroySymbols(cells)`** — deferred to each symbol's `playDestroy()`. Sprite implode by default; Spine subclasses can override to play a disintegration animation.
- **`reelSet.refill({ winners, grid })`** — Moment B for one cascade level.
- **`reelSet.runCascade({ detectWinners, nextGrid })`** — the canonical detect → destroy → pause → refill loop, with `cascade:round:start` fired on entry and `cascade:round:end` (carrying the summary) when the chain ends. Use this in 95% of cases.

Animation timings are config; every other behaviour (badges, multipliers, SFX) is user code via `cascade:*` events.

Everything below is config-driven unless flagged otherwise. Lift the snippets directly.

---

## Recipe 1 — Hello tumble

The minimal viable build. Drop, wait, drop in, loop if wins.

### 1a. Wire the builder

```ts
import {
  ReelSetBuilder,
  SpriteSymbol,
  type Cell,
} from 'pixi-reels';

const reelSet = new ReelSetBuilder()
  .reels(6).visibleSymbols(5).symbolSize(95, 95).symbolGap(5, 5)
  .symbols((r) => r.register('A', SpriteSymbol, { textures }))
  .weights({ A: 10 })
  .tumble({
    fall:   { duration: 280, ease: 'sine.in',       rowStagger: 40 },
    dropIn: { duration: 480, ease: 'back.out(1.6)', rowStagger: 50, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();
```

### 1b. Drive a single spin

```ts
const spinDone = reelSet.spin();
const grid = await server.spin();
reelSet.setResult(grid);
await spinDone;
```

### 1c. Drive a spin + cascade loop — the library way

```ts
async function play() {
  // Moment A — fall, wait, drop in.
  const spinDone = reelSet.spin();
  reelSet.setResult(await server.spin());
  await spinDone;

  // Moment B — runCascade owns the detect → destroy → pause → refill
  // loop and fires `cascade:round:end` when the chain ends.
  await reelSet.runCascade({
    detectWinners: (grid) => detectWinners(grid),
    nextGrid:      (_, winners) => server.cascade(winners),
    pauseAfterDestroyMs: 300,  // 150-500 ms tasteful range
  });
}
```

### 1d. Compose the loop yourself

When you need per-cascade asymmetric pauses, conditional bonus triggers, or any orchestration `runCascade` can't express, drive `refill` directly:

```ts
const PAUSE_AFTER_REMOVAL_MS = 300;

async function play() {
  const spinDone = reelSet.spin();
  reelSet.setResult(await server.spin());
  await spinDone;

  let current = reelSet.getVisibleGrid();
  while (true) {
    const winners: Cell[] = detectWinners(current);
    if (winners.length === 0) break;

    await reelSet.destroySymbols(winners);
    await wait(PAUSE_AFTER_REMOVAL_MS);   // beat: "the wins are GONE"
    const next = await server.cascade(winners);
    await reelSet.refill({ winners, grid: next });
    current = next;
  }
}
```

**The pause matters.** Without it, the refill drop-in begins the same frame the winners hit alpha 0 — the player perceives a teleport. With a 150-500 ms beat the brain registers two distinct events ("wins cleared" → "new symbols arrived"). Match it to your animation feel: snappy slams want ~120 ms; bouncy or wave feels want ~300-400 ms.

The new-grid contract for `refill`: per reel, the top `winners.length` rows are the new symbols, the remaining rows are the survivors in their original top-to-bottom order. Untouched cells don't animate; survivors slide; new symbols drop from above.

---

## Recipe 2 — Pick a feel

Five config-only presets. Same `spin()` / `refill()` driver — only the `tumble({...})` shape changes.

### 2a. Classic (default)

Gentle gravity fall, soft overshoot landing. The all-rounder.

```ts
.tumble({
  fall:   { duration: 280, ease: 'sine.in',       rowStagger: 40 },
  dropIn: { duration: 480, ease: 'back.out(1.6)', rowStagger: 50, distance: 'perHole' },
})
```

### 2b. Cartoon bounce

Loud landing with a couple of bounces. Reads as playful — good for kid-friendly themes.

```ts
.tumble({
  fall:   { duration: 320, ease: 'sine.in',   rowStagger: 60 },
  dropIn: { duration: 700, ease: 'bounce.out', rowStagger: 70, distance: 'perHole' },
})
```

### 2c. Slam stop

Heavy accelerating fall, hard land. Reads as serious / high-stakes.

```ts
.tumble({
  fall:   { duration: 180, ease: 'power4.in', rowStagger: 20 },
  dropIn: { duration: 260, ease: 'expo.out',  rowStagger: 25, distance: 'perHole' },
})
```

### 2d. Rain column

Whole column drops as one slab from far above. Looks like a piece-of-board falling. `distance: 'auto'` makes every animated symbol traverse the full column height in unison.

```ts
.tumble({
  fall:   { duration: 240, ease: 'sine.in', rowStagger: 0 },
  dropIn: { duration: 380, ease: 'sine.in', rowStagger: 0, distance: 'auto' },
})
```

### 2e. Wave

Strong per-row stagger so symbols arrive one-after-another. Reads as a rolling wave from top to bottom.

```ts
.tumble({
  fall:   { duration: 180, ease: 'sine.in',       rowStagger: 90 },
  dropIn: { duration: 320, ease: 'back.out(2.0)', rowStagger: 110, distance: 'perHole' },
})
```

### 2f. Instant (debugging / turbo)

Zero-duration tweens — symbols snap to their new positions. Useful for turbo mode or rendering snapshots in tests.

```ts
.tumble({
  fall:   { duration: 0, ease: 'none', rowStagger: 0 },
  dropIn: { duration: 0, ease: 'none', rowStagger: 0, distance: 'perHole' },
})
```

---

## Recipe 3 — The cascading multiplier

Multiplier starts at ×1 on a fresh spin and ticks up by one every time a cascade fires. The number rolls visibly in the gap between win-fade-out and the next refill drop-in — the moment when the player's eye is free.

The library doesn't model the multiplier itself; it's user code in the spin handler. Three variants show the spread.

### 3a. Simple +1 per cascade

```ts
async function play() {
  let multiplier = 1;
  ui.setMultiplier(1);

  const spinDone = reelSet.spin();
  reelSet.setResult(await server.spin());
  await spinDone;

  // onCascade fires after destroySymbols, before refill — the exact moment
  // when the player's eye is on the holes. Bump the meter there.
  await reelSet.runCascade({
    detectWinners: (grid) => detectWinners(grid),
    nextGrid:      (_, winners) => server.cascade(winners),
    onCascade: async () => {
      multiplier += 1;
      await tickMultiplierUi(multiplier); // 0.4 s number roll
    },
  });
}

async function tickMultiplierUi(target: number): Promise<void> {
  const counter = { v: target - 1 };
  await new Promise<void>((resolve) => {
    gsap.to(counter, {
      v: target,
      duration: 0.4,
      ease: 'power2.out',
      onUpdate: () => {
        document.getElementById('multiplier')!.textContent =
          `MULTIPLIER x${Math.round(counter.v)}`;
      },
      onComplete: () => resolve(),
    });
  });
}
```

### 3b. Doubling tier (×2 → ×4 → ×8)

The tier table is configurable per game — typical Sweet Bonanza / Sugar Rush pattern.

```ts
const MULTIPLIER_TIERS = [1, 2, 4, 8, 16, 32];

async function play() {
  let tier = 0;
  ui.setMultiplier(MULTIPLIER_TIERS[0]);

  const spinDone = reelSet.spin();
  const grid = await server.spin();
  reelSet.setResult(grid);
  await spinDone;

  let current = grid;
  while (true) {
    const winners = detectWinners(current);
    if (winners.length === 0) break;

    await fadeOutWinners(reelSet, winners);
    tier = Math.min(tier + 1, MULTIPLIER_TIERS.length - 1);
    await tickMultiplierUi(MULTIPLIER_TIERS[tier]);

    const next = await server.cascade(winners);
    await reelSet.refill({ winners, grid: next });
    current = next;
  }
}
```

### 3c. Per-row multiplier bumps (one bump per cleared row, capped per spin)

```ts
const MAX_BUMPS_PER_SPIN = 8;

async function play() {
  let multiplier = 1;
  let bumps = 0;
  ui.setMultiplier(1);
  // ... spin Moment A ...

  let current = grid;
  while (true) {
    const winners = detectWinners(current);
    if (winners.length === 0) break;

    await fadeOutWinners(reelSet, winners);

    // Bump by the number of distinct ROWS that had a winner this cascade,
    // capped per spin so the math doesn't get out of hand.
    const wonRows = new Set(winners.map((w) => w.row));
    const add = Math.min(wonRows.size, MAX_BUMPS_PER_SPIN - bumps);
    if (add > 0) {
      bumps += add;
      multiplier += add;
      await tickMultiplierUi(multiplier);
    }

    const next = await server.cascade(winners);
    await reelSet.refill({ winners, grid: next });
    current = next;
  }
}
```

Every variant works because the `await` flow is explicit: the multiplier ticks _after_ the wins have visibly faded and _before_ the refill drop begins. No lifecycle hook required.

---

## Recipe 4 — Per-symbol parallel tweens

`cascade:fall:symbol` and `cascade:dropIn:symbol` fire once per symbol, **right before** the library's GSAP tween on `view.y` begins. Listeners can start parallel tweens on any other property (scale, alpha, tint, badge text, spine track) — they'll run in sync with the library's motion.

The library guarantees the per-symbol event fires **before** the `view.y` tween — listener tweens see the symbol's pre-fall state and can lock in matching durations from the payload's `duration`.

### 4a. Squish-on-impact for drop-in

Symbols compress slightly as they land, then snap back. Pairs well with `ease: 'back.out(...)'` for a punchy feel.

```ts
reelSet.events.on('cascade:dropIn:symbol', ({ view, duration }) => {
  const dropSec = duration / 1000;
  gsap.to(view.scale, {
    x: 1.15, y: 0.85,
    duration: dropSec * 0.85,    // peaks just before land
    ease: 'sine.in',
    yoyo: true, repeat: 1,
    repeatRefresh: false,
    overwrite: 'auto',
  });
});
```

### 4b. Trail fade on fall (lower alpha as the symbol exits)

```ts
reelSet.events.on('cascade:fall:symbol', ({ view, duration, ease }) => {
  gsap.fromTo(view, { alpha: 1 }, {
    alpha: 0.2,
    duration: duration / 1000,
    ease,
    overwrite: 'auto',
  });
});
```

The library sets `alpha = 0` at the end of the fall regardless — this just makes the fade visible during the motion instead of being a hard cut at the end.

### 4c. Spine state on special symbols

Trigger a Spine animation track when a special symbol leaves or arrives — keeps the symbol's choreography in sync with the lib's motion.

```ts
reelSet.events.on('cascade:fall:symbol', ({ symbol }) => {
  if (!(symbol instanceof SpineReelSymbol)) return;
  if (symbol.symbolId !== 'scatter') return;
  symbol.playSpineTrack('fly_out');
});

reelSet.events.on('cascade:dropIn:symbol', ({ symbol }) => {
  if (!(symbol instanceof SpineReelSymbol)) return;
  if (symbol.symbolId !== 'scatter') return;
  symbol.playSpineTrack('drop_in');
});
```

### 4d. Sticky-multiplier badge that rolls as a symbol falls away

If your symbols carry a per-cell multiplier badge that the game wants to "level up" as the symbol leaves frame:

```ts
reelSet.events.on('cascade:fall:symbol', ({ symbol, duration }) => {
  if (!('badge' in symbol)) return;
  const before = symbol.badge.value;
  const after = before * 2;
  const counter = { v: before };
  gsap.to(counter, {
    v: after,
    duration: (duration / 1000) * 0.6,
    ease: 'power2.out',
    onUpdate: () => symbol.badge.setValue(Math.round(counter.v)),
    overwrite: 'auto',
  });
});
```

This is distinct from Recipe 3 (which animates a global UI element). Use Recipe 4d when the value is tied to the specific symbol instance.

### 4e. Per-symbol delay (skip the library's stagger for one row)

Pause the per-symbol effect by `rowIndex` to spread tween starts even further than the library's `rowStagger`.

```ts
reelSet.events.on('cascade:dropIn:symbol', ({ view, duration, rowIndex }) => {
  gsap.from(view, {
    alpha: 0,
    duration: duration / 1000,
    delay: rowIndex * 0.06,  // extra 60 ms per row on top of rowStagger
    overwrite: 'auto',
  });
});
```

---

## Recipe 5 — Filling the empty server wait

In tumble slots, the gap between fall-out and drop-in is the server roundtrip — possibly long. Five things you can do with it.

### 5a. Spinner overlay (the example default)

Show a loading ring once **all** reels finish falling, hide it the moment the **first** reel begins drop-in.

```ts
let fallEnded = 0;
reelSet.events.on('cascade:fall:end', () => {
  fallEnded += 1;
  if (fallEnded === reelSet.reels.length) spinner.visible = true;
});
reelSet.events.on('cascade:dropIn:start', () => {
  spinner.visible = false;
  fallEnded = 0;
});
```

### 5b. Pulsing reel frame

Pulse the reel border between fall-end and drop-in-start — no occluding overlay, the player can see the empty grid.

```ts
let pulseTween: gsap.core.Tween | null = null;
reelSet.events.on('cascade:fall:end', () => {
  if (pulseTween) return;
  pulseTween = gsap.to(reelFrame, {
    pixi: { tint: 0xff5577 },
    duration: 0.6,
    ease: 'sine.inOut',
    yoyo: true, repeat: -1,
  });
});
reelSet.events.on('cascade:dropIn:start', () => {
  pulseTween?.kill(); pulseTween = null;
  gsap.set(reelFrame, { pixi: { tint: 0xffffff } });
});
```

### 5c. Skeleton placeholders

Quick low-cost squares in the empty cells while the server thinks.

```ts
const placeholders: Container[] = [];
reelSet.events.on('cascade:fall:end', ({ reelIndex }) => {
  for (let row = 0; row < reelSet.visibleRows; row++) {
    const ph = makeSkeletonSquare();
    ph.x = reelIndex * cellW;
    ph.y = row * cellH;
    placeholders.push(ph);
    reelSet.addChild(ph);
  }
});
reelSet.events.on('cascade:dropIn:start', () => {
  for (const ph of placeholders) ph.parent?.removeChild(ph);
  placeholders.length = 0;
});
```

### 5d. No fill at all (snappy network)

If your server typically returns in <100 ms, the empty gap is barely visible. Skip the spinner entirely — just don't subscribe.

### 5e. Tighter fall + delayed result reveal

Make fall fast and brief so the empty moment is shorter; rely on the drop-in to carry the visual energy.

```ts
.tumble({
  fall:   { duration: 140, ease: 'expo.in',       rowStagger: 0  },
  dropIn: { duration: 560, ease: 'back.out(1.8)', rowStagger: 80, distance: 'perHole' },
})
```

---

## Recipe 6 — Per-reel stagger (drop order)

By default every reel falls and lands together. `setDropOrder` controls the order columns animate. Same `.tumble({...})` config — the column stagger composes on top of the row stagger.

### 6a. Left-to-right wave

```ts
reelSet.setDropOrder('ltr');
const spinDone = reelSet.spin();
reelSet.setResult(await server.spin());
await spinDone;
```

### 6b. Right-to-left wave

```ts
reelSet.setDropOrder('rtl');
```

### 6c. All at once (default for non-staggered look)

```ts
reelSet.setDropOrder('all');
```

### 6d. Custom per-reel delays

Pass an array of ms delays — one per reel. Mix and match.

```ts
// Outer reels first, middle reels last (V-shape):
reelSet.setDropOrder([0, 80, 160, 160, 80, 0]);
```

### 6e. Randomised order per spin

```ts
function shuffledDelays(count: number, stepMs: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.map((order) => order * stepMs);
}

reelSet.setDropOrder(shuffledDelays(reelSet.reels.length, 70));
```

---

## Recipe 7 — Events for SFX, analytics, telemetry

Pure fire-and-forget. Subscribe once at setup, never unsubscribe (the library cleans up on `destroy`).

### 7a. Per-reel landing SFX

```ts
reelSet.events.on('cascade:dropIn:end', ({ reelIndex }) => {
  audio.play('thud', { reelIndex });
});
```

### 7b. Cascade-level analytics

```ts
let cascadeLevel = 0;
reelSet.events.on('spin:start', () => { cascadeLevel = 0; });
reelSet.events.on('spin:reelLanded', () => { /* per-reel land — not cascade */ });
// Custom: increment our own counter on each refill we drive.
async function play() {
  // ... spin ...
  while (true) {
    const winners = detectWinners(current);
    if (winners.length === 0) break;
    cascadeLevel += 1;
    analytics.track('cascade:level', cascadeLevel, winners.length);
    // ... refill ...
  }
}
```

### 7c. Toggle audio ducking during the server wait

```ts
reelSet.events.on('cascade:fall:start', () => audio.duck(0.4));
reelSet.events.on('cascade:dropIn:start', () => audio.unduck());
```

---

## Event payloads at a glance

| Event | When | Payload |
|---|---|---|
| `cascade:round:start` | Fired once at the top of `runCascade(...)`, before the first `detectWinners` call. **Not** emitted when you compose the loop yourself with bare `refill()` calls. | `{ initialGrid }` |
| `cascade:round:end` | Mirror of `cascade:round:start`. Fired once after the detect → destroy → refill loop exits. Carries the same shape as `RunCascadeResult`. | `{ chainLength, totalWinners, finalGrid, wasSkipped }` |
| `cascade:chain:start` | A single chain stage opens — `detectWinners` returned a non-empty list, destroy is about to run. `chain` is 1-indexed. | `{ chain, winners, currentGrid }` |
| `cascade:chain:end` | A single chain stage closes — both destroy AND refill drop-in finished. About to loop back to `detectWinners`. | `{ chain, winners, nextGrid }` |
| `cascade:fall:start` | A reel's fall-out begins (Moment A only — refills skip fall). | `{ reelIndex }` |
| `cascade:fall:symbol` | Each symbol's fall-out tween is about to start. | `{ symbol, view, reelIndex, rowIndex, duration, ease, distance }` |
| `cascade:fall:end` | A reel's last fall tween settled. | `{ reelIndex }` |
| `cascade:place:end` | New identities placed AND snapped to grid, **before** drop-in starts. Canonical spot for badge / decoration application. Place has no `:start` because it's a synchronous swap. `isInitial: true` on Moment A; on Moment B `winnerRows` lists the row indices whose old symbols were cleared (so listeners can skip survivors). | `{ reelIndex, placedSymbols, isInitial, winnerRows }` |
| `cascade:dropIn:start` | A reel's drop-in begins. | `{ reelIndex }` |
| `cascade:dropIn:symbol` | Each symbol's drop-in tween is about to start. `offsetRows` is the number of cells this symbol traverses (1 for top-row refills, more for survivors sliding past larger holes). | `{ symbol, view, reelIndex, rowIndex, duration, ease, offsetRows }` |
| `cascade:dropIn:end` | A reel's last drop-in tween settled. | `{ reelIndex }` |
| `cascade:destroy:start` | `destroySymbols(cells)` is about to start. Fires from every call — both direct and inside `runCascade`. Empty-batch calls do not emit. | `{ cells }` |
| `cascade:destroy:end` | `destroySymbols(cells)` finished — every `playDestroy()` resolved and the viewport dim (if any) was restored. | `{ cells }` |

---

## When events aren't enough — replace a phase

Each of `cascade:fall`, `cascade:place`, `cascade:dropIn` is a `ReelPhase` subclass registered in the factory under its own key. Override any one independently without touching the others.

### 8a. Sideways exit (replaces `cascade:fall`)

Symbols fly off the side of the screen instead of falling down.

```ts
import { ReelPhase, type CascadeFallPhaseConfig } from 'pixi-reels';

class CometFallPhase extends ReelPhase<CascadeFallPhaseConfig> {
  readonly name = 'cascade:fall';
  readonly skippable = true;
  // ... (see src/spin/phases/CascadeFallPhase.ts for the full contract)
}

builder.tumble({ /* ... */ }).phases((f) => f.register('cascade:fall', CometFallPhase));
```

The other two phases keep their library defaults. `place` and `dropIn` continue to run as usual after your `cascade:fall` completes.

### 8b. Slower place with cinematic pause (replaces `cascade:place`)

If your game wants a held beat between fall and drop-in (e.g. for a "feature trigger" reveal):

```ts
class HeldPlacePhase extends ReelPhase<CascadePlacePhaseConfig> {
  readonly name = 'cascade:place';
  readonly skippable = true;
  // Inside _doPlace, after placeSymbols + emit, wait 400 ms before completing.
}

builder.tumble({ /* ... */ }).phases((f) => f.register('cascade:place', HeldPlacePhase));
```

Reach for phase override only when no combination of events + animation config can express what you need — most game-side effects fit in a `cascade:*:symbol` listener.
