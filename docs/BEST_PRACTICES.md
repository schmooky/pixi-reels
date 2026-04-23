# Best practices

How to build a real slot on pixi-reels. Developer-facing companion to [`AGENTS.md`](../AGENTS.md) (contributor-facing) and the [ADRs](./adr/README.md).

Read the **Scope** section of [ADR 007](./adr/007-scope.md) first. If you came here looking for a feature pixi-reels doesn't ship, that doc tells you where it belongs.

## Mental model

```
your server           pixi-reels            your game code
───────────           ──────────            ──────────────
RNG                   reelSet.spin()        UI (spin button, balance, bet)
outcome grid   ────▶  reelSet.setResult()   win detection + paytable math
anticipation   ────▶  reelSet.setAnticipation()   audio
                      events       ────▶    bonus state machine
                      grid                  i18n, analytics, wallet
```

pixi-reels owns the middle column. You own the left and right columns. The flow is strictly left-to-right — the library never calls into your server, and it never generates money math.

## The shape of a spin

```ts
async function spin() {
  const promise = reelSet.spin();               // kick off the animation
  const response = await fetch('/api/spin').then((r) => r.json());

  if (response.anticipationReels?.length) {
    reelSet.setAnticipation(response.anticipationReels);
  }
  reelSet.setResult(response.symbols);          // server decided, lib lands
  const landing = await promise;                 // resolves on spin:complete

  const wins = detectWins(landing.symbols);      // YOUR match logic
  if (wins.length > 0) {
    await reelSet.spotlight.cycle({
      lines: wins.map((w) => ({ positions: w.positions })),
      perLine: 1000,
    });
  }
}
```

Three things to notice:

1. `reelSet.spin()` returns a promise you await *after* the server call. The reels are already spinning while your server is thinking.
2. `setResult()` drives the stop. If `setResult()` hasn't been called by the time all reels are in the SPIN phase, the library waits for it.
3. Win detection, win rendering, and win payout all live in your code. The library provides the visual primitive (`spotlight.cycle`) but does not compute wins.

## Wire audio to events, never to method calls

```ts
// DO
reelSet.events.on('spin:start',       () => audio.play('spin_loop'));
reelSet.events.on('spin:reelLanded',  () => audio.play('reel_stop'));
reelSet.events.on('spin:complete',    () => audio.stop('spin_loop'));
reelSet.events.on('spotlight:start',  () => audio.play('big_win_cue'));

// DO NOT — couples your audio to the library's method calls and misses paths like skip().
function onSpinButtonPress() {
  audio.play('spin_loop');
  reelSet.spin();
}
```

Every exit path from a spin (skip, destroy, interrupted by a new spin) fires the right events. Your audio stays correct by listening once.

## Testing your mechanic

Build your test around `createTestReelSet`. Headless symbols, fake ticker, synchronous spin — your test doesn't care about PixiJS at all.

```ts
import { createTestReelSet, countSymbol } from 'pixi-reels';
import { CheatEngine, forceScatters } from '@/shared/cheats';

it('3 scatters triggers the bonus handler', async () => {
  const h = createTestReelSet({
    reels: 5, visibleRows: 3,
    symbolIds: ['a', 'b', 'c', 'scatter'],
  });
  try {
    const engine = new CheatEngine({
      reelCount: 5, visibleRows: 3,
      symbolIds: ['a', 'b', 'c', 'scatter'],
      seed: 1,
    });
    engine.register({ id: 's', label: 's', enabled: true, cheat: forceScatters(3, 'scatter') });

    const bonusFired = vi.fn();
    h.reelSet.events.on('spin:complete', ({ symbols }) => {
      if (countScattersInGrid(symbols) >= 3) bonusFired();
    });

    await h.spinAndLand(engine.next().symbols);

    expect(bonusFired).toHaveBeenCalledOnce();
    expect(countSymbol(h.reelSet, 'scatter')).toBe(3);
  } finally {
    h.destroy();
  }
});
```

The same pattern scales up: cascade sequences (use `runCascade` with a semantic `winners` callback), hold-and-win persistence (`setHeld` + `holdAndWinProgress` cheat), anticipation + skip mid-flight.

## Spine symbols

Use `pixi-reels/spine`, not `pixi-reels`:

```ts
import { SpineReelSymbol } from 'pixi-reels/spine';
```

Register one class per symbol id, mapping to a pre-loaded skeleton alias and the shared atlas alias:

```ts
builder.symbols((r) => {
  for (const id of symbolIds) {
    r.register(id, SpineReelSymbol, {
      spineMap,                              // { id: { skeleton, atlas } }
      animations: { low1: { idle: 'ide' } }, // per-symbol overrides
      scale: 0.55,
    });
  }
});
```

Fire one-shots from your game code on the library's events:

```ts
reelSet.events.on('spin:reelLanded', (reelIndex) => {
  const reel = reelSet.getReel(reelIndex);
  for (let row = 0; row < reel.getVisibleSymbols().length; row++) {
    (reel.getSymbolAt(row) as SpineReelSymbol).playLanding();
  }
});
```

Missing animations are silent no-ops. If your asset doesn't have `landing`, the call is a free-lunch skip.

## Presenting wins

`pixi-reels` never computes wins — your server or eval does. For showing them, the library ships three stacked pieces: raw events, a `LineRenderer` interface, and the `WinPresenter` that orchestrates both.

```ts
import { WinPresenter, GraphicsLineRenderer, type Payline } from 'pixi-reels';

const presenter = new WinPresenter(reelSet, {
  lineRenderer: new GraphicsLineRenderer(),
});

reelSet.events.on('spin:complete', async (result) => {
  const paylines: Payline[] = await server.wins(result);
  await presenter.show(paylines);
});
reelSet.events.on('spin:start', () => presenter.abort());
```

Pick the level of abstraction that matches the art:

| You want… | Use |
|---|---|
| Default bounce + line + dim | `WinPresenter` + `GraphicsLineRenderer`, config-only |
| Same orchestration but a premium line look | `WinPresenter` + a custom `LineRenderer` (Spine rig, sprite sheet, particle trail) |
| Same orchestration but a custom per-symbol animation | `WinPresenter`'s `symbolAnim: (sym, cell, win) => Promise<void>` |
| Cascade / cluster pops — no line, just animate the cells | `WinPresenter` with no `lineRenderer`, pass `ClusterWin[]` to `show()` |
| Full control; the lib must not draw anything | `WinPresenter` without a `lineRenderer`, subscribe to `win:line` / `win:cluster` / `win:symbol` and draw with `reelSet.getCellBounds(col, row)` |

`win:start` / `win:line` / `win:cluster` / `win:symbol` / `win:end` fire whether or not you use the presenter. An event-only integration is the right call when wins belong to a separate feature layer (scatter overlays, big-win canvases, sound routers) that needs its own lifecycle.

### Paylines vs. cluster wins

```ts
// Classic payline — one row per reel, null to skip
interface Payline { lineId: number; line: (number | null)[]; value: number; kind?: string }

// Cascade / cluster — arbitrary cells, possibly multiple per reel
interface ClusterWin { clusterId: number; cells: SymbolPosition[]; value: number; kind?: string }

type Win = Payline | ClusterWin;
```

`WinPresenter.show(wins)` accepts a mixed list. Paylines get the `LineRenderer`; clusters skip it. A bonus round that combines a 500× scatter splash with a 50× line win presents both with a single `show()` call, sorted by value. In event handlers, narrow with `isPayline(win)` / `isCluster(win)` if you need to branch.

Cascades drive the same API from the `onWinnersVanish` hook — see the `cascade-winpresenter` recipe.

## Symbol layering and overflow

Slot art often overflows the cell — a drop-shadowed wild, a celebration frame bigger than its box. Two knobs control render order:

- **Per-symbol base:** `symbolData.zIndex` on each registered symbol. The library multiplies it by `100` and adds the symbol's current visual row, so scatters / bonuses draw in front of regulars, and bottom-row symbols draw in front of upper rows — overflow naturally spills downward without clipping neighbours.
- **Per-reel ordering:** `reel.container.zIndex` defaults to `reelIndex`, so the rightmost reel draws on top. If your art overflows bottom-left instead of bottom-right, flip the sign: `reel.container.zIndex = -reelIndex` right after building the reel set.

For mid-spin celebrations that need to break out of the reel mask entirely, use `reelSet.spotlight` (dim + promote) or pass a renderer that draws into `reelSet.viewport.unmaskedContainer`.

## Speed modes and "feel"

`SpeedManager` holds named `SpeedProfile` objects. Switch at runtime:

```ts
reelSet.speed.addProfile('cinematic', {
  name: 'cinematic',
  spinDelay: 280,
  spinSpeed: 38,
  stopDelay: 180,
  anticipationDelay: 1400,
  bounceDistance: 14,
  bounceDuration: 260,
  accelerationEase: 'power3.in',
  decelerationEase: 'elastic.out(1, 0.5)',
  accelerationDuration: 420,
  minimumSpinTime: 1400,
});
reelSet.setSpeed('cinematic');
```

This is where you honour `prefers-reduced-motion`: switch to a profile with minimal `bounceDistance` and `accelerationDuration`.

## Destroy everything on teardown

`ReelSet.destroy()` cascades through every subsystem. Call it once from your scene teardown, don't chase individual pieces.

```ts
function tearDownGame() {
  reelSet.destroy();
  // DO NOT also call reelSet.reels[i].destroy() — double-free.
}
```

If a class you're writing holds resources, implement `Disposable` and hook into the chain from your top-level orchestrator. Never call `PIXI.Ticker.add` directly — wrap in a `TickerRef`.

## Common traps

| Trap | Symptom | Fix |
|---|---|---|
| Calling `setResult()` before all reels are in SPIN | Reels stop early on the *previous* spin's frame | The library already waits; don't call `setResult` inside `spin:start`. Wait for `spin:allStarted` (or just call it when your server response arrives — the library buffers). |
| Forgetting `ticker(app.ticker)` on the builder | `Error: ticker() must be called …` at `build()` | Required call. Builder validates at `.build()` time. |
| `diffCells` on a pattern cascade | Survivors animate as "new" symbols dropping from above | Pass semantic `winners: (prev) => Cell[]` to `runCascade`. See [ADR 010](./adr/010-cascade-physics.md). |
| Putting cheat code in game bundle | Bundle bloat + players find cheats | Cheats are `examples/shared/` only. [ADR 009](./adr/009-cheats-live-outside-lib.md). |
| Importing `SpineReelSymbol` from the main barrel | Your bundle includes the Spine runtime even if you only use sprites | Import from `pixi-reels/spine`. [ADR 011](./adr/011-spine-subpath-and-vocabulary.md). |
| Running `gsap` from its default ticker | Animations freeze in hidden tabs or iframes | Sync GSAP with the PixiJS ticker: `gsap.ticker.remove(gsap.updateRoot); app.ticker.add(t => gsap.updateRoot(t.lastTime / 1000))`. |
| Symbol class doesn't implement `resize()` | Symbols scatter after any swap | `Reel._replaceSymbol` calls `resize()` on every swap. Store the dimensions; reposition every child you own. |

## What not to put in your code

- **Don't reimplement the reel engine.** If you're writing a class called `SpinManager` or `ReelController`, stop and use `reelSet`.
- **Don't extend `ReelSet`.** It's a `PIXI.Container`; compose with it, don't subclass.
- **Don't store reel state in React.** Game state is server state + reel visual state. React can read via events; don't mirror.
- **Don't mute the library's events.** If you're swallowing `spin:complete` because it fires "too often," your consumer code has a bug.

## Further reading

- [ADR 007 — Scope](./adr/007-scope.md) is mandatory reading before proposing a feature.
- [`AGENTS.md`](../AGENTS.md) at the repo root is the contributor / AI-agent guide.
- The site at [pixi-reels.dev](https://pixi-reels.dev) has a `/recipes/` cookbook and an `/architecture/` visual deep-dive.
