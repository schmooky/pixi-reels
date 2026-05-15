# Tumble cascade recipe — drop-on-click, gravity refill, cascading multiplier

A tumble slot has two distinct animation moments:

- **Moment A — Spin click.** Existing symbols fall off the bottom of the viewport. The reels sit empty (or show a spinner) while the server responds. New symbols drop in from above.
- **Moment B — Cascade refill.** After a win, the matching cells are cleared by user code. Survivor symbols slide down to fill the gaps below them; new symbols drop into the holes at the top.

The library handles both via three named phases — `cascade:fall`, `cascade:place`, `cascade:dropIn` — wired through `builder.tumble(...)` and `reelSet.spin()` / `reelSet.refill(...)`. Animation timings are config; every other behaviour (badges, multipliers, SFX, win-clear) is user code listening to `cascade:*` events.

## Wire it up

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
    // Existing symbols falling off on spin click.
    fall:   { duration: 280, ease: 'sine.in',       rowStagger: 40 },
    // New symbols (and sliding survivors) entering from above.
    dropIn: {
      duration: 480,
      ease: 'back.out(1.6)',
      rowStagger: 50,
      // 'perHole' = gravity-correct: each symbol falls exactly the
      // distance its hole demands. Use 'auto' for "every symbol falls
      // a full column height", or a number for a fixed pixel distance.
      distance: 'perHole',
    },
  })
  .ticker(app.ticker)
  .build();
```

## Drive the spin

```ts
async function play() {
  // Moment A — fall + wait + drop-in. `setResult` resolves the server wait.
  const spinDone = reelSet.spin();
  const grid = await server.spin();
  reelSet.setResult(grid);
  await spinDone;

  // Moment B — cascade refill loop. User code clears winners, then
  // hands the next grid + the cleared cells to `refill`.
  let current = grid;
  while (true) {
    const winners: Cell[] = detectWinners(current);
    if (winners.length === 0) break;

    await fadeOutWinners(reelSet, winners);
    const next = await server.cascade(winners);
    await reelSet.refill({ winners, grid: next });
    current = next;
  }
}
```

The new-grid contract for `refill` follows server-side gravity: per reel, the top `winners.length` rows are the new symbols, the remaining rows are the survivors in their original top-to-bottom order. Untouched cells don't animate; survivors slide; new symbols drop from above.

## Recipe: cascading multiplier ticker

A common pattern: the multiplier starts at ×1 on a fresh spin and ticks up by one every time a cascade fires. The number rolls visibly in the gap between win-fade-out and the next refill drop-in — the moment when the player's eye is free.

The library doesn't model this multiplier itself; it's pure user code in your spin handler. The cascade events are useful for SFX/UI cosmetics, but the multiplier increment lives in the `await` flow:

```ts
async function play() {
  let multiplier = 1;
  ui.setMultiplier(1);

  // Moment A
  const spinDone = reelSet.spin();
  const grid = await server.spin();
  reelSet.setResult(grid);
  await spinDone;

  // Moment B — bump the multiplier between fade and refill
  let current = grid;
  while (true) {
    const winners = detectWinners(current);
    if (winners.length === 0) break;

    await fadeOutWinners(reelSet, winners);
    multiplier += 1;
    await tickMultiplierUi(multiplier);   // 0.4 s number roll

    const next = await server.cascade(winners);
    await reelSet.refill({ winners, grid: next });
    current = next;
  }
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
          `MULTIPLIER ×${Math.round(counter.v)}`;
      },
      onComplete: () => resolve(),
    });
  });
}
```

The pattern works because every `await` is explicit: the multiplier ticks _after_ the wins have visibly faded and _before_ the refill drop begins. No lifecycle hook required.

## Events — informational fire-and-forget

Each cascade boundary emits on `reelSet.events`. Use them for SFX, analytics, badges, spine state — anything that runs in parallel with the library's `view.y` motion.

| Event | When | Payload |
|---|---|---|
| `cascade:fall:start` | A reel's fall-out begins (Moment A only). | `{ reelIndex }` |
| `cascade:fall:symbol` | One symbol's fall-out tween is about to start. | `{ symbol, view, reelIndex, rowIndex, duration, ease, distance }` |
| `cascade:fall:end` | A reel's last fall tween settled. | `{ reelIndex }` |
| `cascade:place:done` | New identities have been placed AND snapped to grid, **before** drop-in starts. The canonical spot to apply badges/decorations. | `{ reelIndex, placedSymbols }` |
| `cascade:dropIn:start` | A reel's drop-in begins. | `{ reelIndex }` |
| `cascade:dropIn:symbol` | One symbol's drop-in tween is about to start. | `{ symbol, view, reelIndex, rowIndex, duration, ease, offsetRows }` |
| `cascade:dropIn:end` | A reel's last drop-in tween settled. | `{ reelIndex }` |

### Example: spinner overlay during the empty wait

Show a spinner from the moment **all** reels finish falling until the **first** reel begins its drop-in. That window is exactly the indeterminate server wait.

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

### Example: parallel-tween a property as a symbol falls

`cascade:fall:symbol` fires once per symbol, right before the GSAP tween on `view.y` starts. Listeners can start their own parallel tweens on any other property (scale, alpha, tint, badge text) — they'll run in sync with the library's motion.

```ts
reelSet.events.on('cascade:fall:symbol', ({ view, ctx, symbol }) => {
  if (symbol.kind !== 'special') return;
  gsap.to(view.scale, {
    x: 1.2, y: 0.8,
    duration: ctx.duration / 1000,
    ease: ctx.ease,
  });
});
```

The library guarantees the per-symbol event fires **before** the `view.y` tween — so listener tweens see the symbol's pre-fall state and can lock in matching durations from `ctx`.

## When events aren't enough — replace a phase

Each of `cascade:fall`, `cascade:place`, `cascade:dropIn` is a `ReelPhase` subclass registered in the factory under its own key. Override any one independently without touching the others:

```ts
import { ReelPhase } from 'pixi-reels';

class CometFallPhase extends ReelPhase<CascadeFallPhaseConfig> {
  readonly name = 'cascade:fall';
  readonly skippable = true;
  // ... see CascadeFallPhase.ts for the full contract
}

builder.tumble({ /* ... */ }).phases((f) => f.register('cascade:fall', CometFallPhase));
```

The other two phases keep their library defaults. Reach for this only when no combination of events + animation config can express what you need — most game-side effects fit in a `cascade:*:symbol` listener.
