# pixi-reels

[![npm version](https://img.shields.io/npm/v/pixi-reels?color=cb3837&logo=npm)](https://www.npmjs.com/package/pixi-reels)
[![npm downloads](https://img.shields.io/npm/dm/pixi-reels?color=cb3837&logo=npm)](https://www.npmjs.com/package/pixi-reels)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/pixi-reels?label=gzip)](https://bundlephobia.com/package/pixi-reels)
[![CI](https://github.com/schmooky/pixi-reels/actions/workflows/ci.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/ci.yml)
[![Release](https://github.com/schmooky/pixi-reels/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/npm-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/schmooky/pixi-reels/blob/main/LICENSE)
[![PixiJS v8](https://img.shields.io/badge/PixiJS-v8-e91e63)](https://pixijs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

`pixi-reels` is a reel engine for [PixiJS v8](https://pixijs.com/). It ships reel-only primitives: spin lifecycle, symbols, speed profiles, pins, cascades, win presenter. Win math, paytable math, RNG, and audio live in consumer code.

Install:

```bash
pnpm add pixi-reels pixi.js gsap
```

Docs and recipes at [pixi-reels.schmooky.dev](https://pixi-reels.schmooky.dev). Agent-facing instructions are in [AGENTS.md](https://github.com/schmooky/pixi-reels/blob/main/AGENTS.md).

## Quick start

```ts
import { Application } from 'pixi.js';
import { ReelSetBuilder, SpriteSymbol, SpeedPresets } from 'pixi-reels';

const app = new Application();
await app.init({ width: 900, height: 540, background: '#0a0d14' });
document.body.appendChild(app.canvas);

const reelSet = new ReelSetBuilder()
  .reels(5).visibleCells(3).symbolSize(140, 140)
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

const spin = reelSet.spin();
const result: string[][] = await fetchSpinFromServer();
reelSet.setResult(result.map((visible) => ({ visible })));
await spin;
```

## Any orientation, any direction

One engine runs four layouts. Anticipation, cascades, spotlight, pins, big
symbols, pyramids and MultiWays all work in every one of them.

```ts
new ReelSetBuilder()
  .orientation('horizontal')   // strip travels on X, reels march down Y
  .direction('reverse')        // ...and travels right-to-left
  .directionPerReel(['forward', 'reverse', 'forward'])  // or mix per reel
```

|  | `direction('forward')` | `direction('reverse')` |
|---|---|---|
| `orientation('vertical')` | symbols fall (the default) | a roll-up |
| `orientation('horizontal')` | a sideways banner | ...running the other way |

Screen-space inputs stay screen-space: `symbolSize(width, height)`,
`ReelSymbol.resize(width, height)` and `getCellBounds` never change meaning,
so a horizontal set is the vertical one transposed and your own symbol
classes need no changes. Grid indices do not move either -- cell
`(reel, cell)` means the same thing whichever way the strip runs.

Travel changes motion; facing changes art; they never change each other. A
reel spinning sideways still renders every symbol upright.

See [the guide](https://pixi-reels.schmooky.dev/guides/orientation-and-direction/).

## Core API at a glance

```ts
reelSet.spin(): Promise<SpinResult>             // Start spinning
reelSet.setResult(symbols: ColumnTarget[])      // Pass the target grid. Triggers the stop.
reelSet.setAnticipation([3, 4])                 // Slow reels 3+4 before they land
reelSet.setStopDelays([0, 140, 280, 600, 1100]) // Override per-reel stop stagger
reelSet.skipSpin()                              // Round-aware slam plus boost / auto-slam side effect
reelSet.slamStop()                              // Unconditional land-now (no boost)
reelSet.skipNudge()                             // Fast-forward an in-flight nudge() to its landed position
reelSet.setSpeed('turbo')                       // Switch speed profile
reelSet.spotlight.show(positions, opts)         // One-shot win highlight
reelSet.events.on('spin:reelLanded', (i, s) => {/* ... */})
reelSet.destroy()                               // Full teardown
```

See [/api/](https://pixi-reels.schmooky.dev/api/) for the full TypeDoc reference.
Upgrading? [Migrating to 2.0](https://pixi-reels.schmooky.dev/docs/migrating-to-2-0/)
lists every breaking change and starts with the codemod:

```bash
npx pixi-reels-codemod v1-to-v2 src
```

## Spine symbols (optional subpath)

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

```ts
import { enableDebug } from 'pixi-reels';
enableDebug(reelSet);
```

In the browser console (or via Playwright / agent eval):

```
__PIXI_REELS_DEBUG.log()       // ASCII grid + state snapshot
__PIXI_REELS_DEBUG.snapshot()  // Full JSON state
__PIXI_REELS_DEBUG.trace()     // Log spin, skip, speed, spotlight, shape, pin events
```

## Examples

Runnable demos live on the docs site under [`/recipes`](https://pixi-reels.pages.dev/recipes/) -- about 130 of them, each with its full source next to it, covering line pays, cascades, hold and win, big symbols, nudge, anticipation and every mechanic that used to have its own example app. They run in the page, so there is nothing to clone or start.

```bash
pnpm site:dev     # the whole recipe set, locally
```

The standalone `examples/` apps moved to their own repo in 2.0. Keeping two parallel demo surfaces in one repo meant every API change had to be made twice, and the example half kept losing.

## Peer dependencies

- `pixi.js` ^8.18.1
- `gsap` ^3.15.0
- `@esotericsoftware/spine-pixi-v8` ~4.2.110 (optional, only if you use `SpineReelSymbol`)

## Contributing

PRs welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the workflow, changesets, and the style rules the lint guards enforce.

## License

MIT.
