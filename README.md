# pixi-reels

[![npm version](https://img.shields.io/npm/v/pixi-reels?color=cb3837&logo=npm)](https://www.npmjs.com/package/pixi-reels)
[![npm downloads](https://img.shields.io/npm/dm/pixi-reels?color=cb3837&logo=npm)](https://www.npmjs.com/package/pixi-reels)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/pixi-reels?label=gzip)](https://bundlephobia.com/package/pixi-reels)
[![CI](https://github.com/schmooky/pixi-reels/actions/workflows/ci.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/ci.yml)
[![Release](https://github.com/schmooky/pixi-reels/actions/workflows/release.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/release.yml)
[![CodeQL](https://github.com/schmooky/pixi-reels/actions/workflows/codeql.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![PixiJS v8](https://img.shields.io/badge/PixiJS-v8-e91e63)](https://pixijs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A slot machine reel engine for [PixiJS v8](https://pixijs.com/). Fluent builder, typed events, and the weighty spin+stop feel modeled on real-money games — in about 35 kB gzipped.

```bash
pnpm add pixi-reels pixi.js gsap
```

```ts
import { Application } from 'pixi.js';
import { ReelSetBuilder, SpriteSymbol, SpeedPresets } from 'pixi-reels';

const app = new Application();
await app.init({ width: 900, height: 540, background: '#0a0d14' });
document.body.appendChild(app.canvas);

const reelSet = new ReelSetBuilder()
  .reels(5).visibleSymbols(3).symbolSize(140, 140)
  .symbols((r) => {
    r.register('cherry', SpriteSymbol, { textures: { cherry: cherryTex } });
    r.register('seven',  SpriteSymbol, { textures: { seven:  sevenTex } });
    r.register('bar',    SpriteSymbol, { textures: { bar:    barTex   } });
  })
  .weights({ cherry: 40, seven: 10, bar: 20 })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo',  SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

app.stage.addChild(reelSet);

// Kick off the spin, tell it where to land, await the bounce.
const spin = reelSet.spin();
reelSet.setResult(await fetchSpinFromServer());
const { symbols } = await spin;
```

## What it does

- **Spin lifecycle** — `START -> SPIN -> ANTICIPATION -> STOP` phases, each pluggable.
- **Weighty stops** — the reel carries momentum through the target frame, snaps, then bounces. No floaty ease-in deceleration.
- **Speed modes** — Normal / Turbo / SuperTurbo built in, or register your own profile.
- **Skip / slam-stop** — second tap of the spin button immediately lands the reels on target.
- **Win spotlight** — dim non-winners, promote winning symbols above the mask, cycle lines.
- **Symbol plugins** — SpriteSymbol, AnimatedSpriteSymbol, SpineSymbol, or implement `ReelSymbol`.
- **Frame middleware** — intercept the symbol generator (e.g. "no triples", multiplier injection).
- **Object pooling** — zero-allocation spinning via `ObjectPool<T>`.
- **Typed events** — `spin:start`, `spin:reelLanded`, `speed:changed`, `spotlight:end`, ...
- **Headless testing** — `createTestReelSet` + `FakeTicker` run the full lifecycle in Node.
- **Debug mode** — `enableDebug(reelSet)` exposes JSON and ASCII snapshots on `window`.

## Docs

The docs site lives in [`apps/site`](apps/site/). Run it locally:

```bash
pnpm site:dev       # http://localhost:4321
```

You'll find:

- **Guides** — getting started, spin lifecycle, symbols, speed modes, win animations, debugging.
- **Recipes** — small how-tos for common mechanics (walking wilds, sticky wilds, cascade, mystery reveal, hold & win, ...). Each ships with a live mini-demo.
- **Demos** — full mechanic sandboxes with cheat panels. One click forces a scatter, a near-miss, a guaranteed jackpot.
- **Sandbox** — in-browser TypeScript playground; edit the file, hit Run, reels rebuild.
- **Wiki** — API reference.

## Examples

Runnable apps in [`examples/`](examples/):

| Example          | What it shows                                              | Run                                    |
|------------------|------------------------------------------------------------|----------------------------------------|
| `classic-spin`   | 5x3 line-pay slot with Spine symbols and speed toggle      | `pnpm --filter classic-spin dev`       |
| `cascade-tumble` | 6x5 tumble mechanic with win spotlight between stages      | `pnpm --filter cascade-tumble dev`     |
| `hold-and-win`   | 5x3 base game + respin bonus with locking coins            | `pnpm --filter hold-and-win dev`       |
| `sandbox`        | Single editable TS file, HMR rebuild                       | `pnpm --filter sandbox dev`            |

## Core API at a glance

```ts
reelSet.spin(): Promise<SpinResult>             // Start spinning
reelSet.setResult(symbols: string[][])          // Pass the target grid (triggers the stop)
reelSet.setAnticipation([3, 4])                 // Slow reels 3+4 before their landing
reelSet.setStopDelays([0, 140, 280, 600, 1100]) // Override per-reel stop stagger
reelSet.skip()                                  // Slam-stop
reelSet.setSpeed('turbo')                       // Switch speed profile
reelSet.spotlight.show(positions, opts)         // One-shot win highlight
reelSet.spotlight.cycle(lines, opts)            // Cycle through win lines
reelSet.events.on('spin:reelLanded', (i, s) => {/* ... */})
reelSet.destroy()                               // Full teardown
```

Full reference: `/wiki/` on the docs site.

## Spine symbols (optional)

pixi-reels ships a Spine adapter on a separate subpath so the runtime tree-shakes out when you don't need it:

```ts
import { SpineReelSymbol } from 'pixi-reels/spine';

r.register('wild', SpineReelSymbol, {
  spineMap: { wild: { skeleton: 'wildData', atlas: 'myAtlas' } },
  autoPlayBlur: true,     // plays `blur` during spin
  autoPlayLanding: true,  // plays `landing` on reel stop
});
```

Install the peer: `pnpm add @esotericsoftware/spine-pixi-v8`.

## Debug mode

Handy for development and essential when an AI agent needs to inspect reel state without parsing a canvas:

```ts
import { enableDebug } from 'pixi-reels';
enableDebug(reelSet);
```

In the browser console (or via Playwright / an agent's `eval`):

```
__PIXI_REELS_DEBUG.log()       // ASCII grid + state snapshot
__PIXI_REELS_DEBUG.snapshot()  // Full JSON state
__PIXI_REELS_DEBUG.trace()     // Log every domain event as it fires
```

## Architecture

```
ReelSetBuilder --builds--> ReelSet
                             |- SpinController ..... orchestrates the phases per reel
                             |- SpeedManager ....... named profiles + live switching
                             |- SymbolSpotlight .... win animations
                             |- ReelViewport ....... masked + unmasked containers
                             '- Reel[] ............. one per column
                                  |- ReelSymbol[] .. SpriteSymbol / AnimatedSpriteSymbol / SpineSymbol
                                  |- ReelMotion .... y displacement + wrap
                                  '- StopSequencer . target-frame consumption
```

Single ticker, no circular deps, no default exports, tree-shakes cleanly.

## Peer dependencies

- `pixi.js` ^8.17.0
- `gsap` ^3.14.0
- `@esotericsoftware/spine-pixi-v8` ^4.2.108 _(optional — only if you use `SpineReelSymbol`)_

## Contributing

PRs welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the workflow, changesets, and the handful of style rules the lint guards enforce.

## License

MIT.
