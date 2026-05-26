# pixi-reels

[![npm version](https://img.shields.io/npm/v/pixi-reels?color=cb3837&logo=npm)](https://www.npmjs.com/package/pixi-reels)
[![npm downloads](https://img.shields.io/npm/dm/pixi-reels?color=cb3837&logo=npm)](https://www.npmjs.com/package/pixi-reels)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/pixi-reels?label=gzip)](https://bundlephobia.com/package/pixi-reels)
[![CI](https://github.com/schmooky/pixi-reels/actions/workflows/ci.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/ci.yml)
[![Release](https://github.com/schmooky/pixi-reels/actions/workflows/release.yml/badge.svg)](https://github.com/schmooky/pixi-reels/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![PixiJS v8](https://img.shields.io/badge/PixiJS-v8-e91e63)](https://pixijs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

`pixi-reels` 1.0.0 is a reel engine for [PixiJS v8](https://pixijs.com/). It ships reel-only primitives: spin lifecycle, symbols, speed profiles, pins, cascades, win presenter. Win math, paytable math, RNG, and audio live in consumer code.

Install:

```bash
pnpm add pixi-reels pixi.js gsap
```

Docs and recipes at [pixi-reels.schmooky.dev](https://pixi-reels.schmooky.dev). Agent-facing instructions are in [AGENTS.md](./AGENTS.md).

## Quick start

```ts
import { Application } from 'pixi.js';
import { ReelSetBuilder, SpriteSymbol, SpeedPresets } from 'pixi-reels';

const app = new Application();
await app.init({ width: 900, height: 540, background: '#0a0d14' });
document.body.appendChild(app.canvas);

const reelSet = new ReelSetBuilder()
  .reels(5).visibleRows(3).symbolSize(140, 140)
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

See [/api/](https://pixi-reels.schmooky.dev/api/) for the full TypeDoc reference and [docs/migrating-to-1-0/](https://pixi-reels.schmooky.dev/docs/migrating-to-1-0/) for the breaking-change list.

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
__PIXI_REELS_DEBUG.trace()     // Log every domain event as it fires
```

## Examples

Runnable apps in [`examples/`](examples/):

| Example          | What it shows                                              | Run                                    |
|------------------|------------------------------------------------------------|----------------------------------------|
| `classic-spin`   | 5x3 line-pay slot with sprite symbols and speed toggle     | `pnpm --filter classic-spin dev`       |
| `cascade-tumble` | 6x5 tumble mechanic with win spotlight between stages      | `pnpm --filter cascade-tumble dev`     |
| `sandbox`        | Single editable TS file, HMR rebuild                       | `pnpm --filter sandbox dev`            |

## Peer dependencies

- `pixi.js` ^8.17.0
- `gsap` ^3.14.0
- `@esotericsoftware/spine-pixi-v8` ^4.2.108 (optional, only if you use `SpineReelSymbol`)

## Contributing

PRs welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the workflow, changesets, and the style rules the lint guards enforce.

## License

MIT.
