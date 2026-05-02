# pixi-reels symbol generator

Generates 10 Spine 4.x skeleton JSONs + 1 shared libGDX atlas + 1 shared PNG. Animations are authored in a typed DSL and compiled to Spine JSON.

## Setup

```bash
bun install
```

Drop your fonts into `fonts/`:

```
fonts/
  Inter-Black.ttf
  Inter-Bold.ttf
  NotoSansSymbols2-Regular.ttf
```

## Build

```bash
bun run build
```

Outputs to `out/`: 10 `*.json` skeletons + `symbols.atlas` + `symbols.png`.

## Authoring animations

Animations live in `scripts/animations/`, one file per animation. The DSL is relative-time: each `.xxxTo(value, duration)` advances a per-property cursor by `duration` and places a key.

```ts
import { anim, frames } from '../lib/dsl';

export const win = anim('win')
  .bone('root', (b) => b
    .scale(1.0)                              // baseline at frame 0
    .scaleTo(1.25, frames(8),  'easeOut')    // 8 frames later
    .scaleTo(0.95, frames(10))               // 10 frames after that
    .scaleTo(1.05, frames(12))
    .scaleTo(1.0,  frames(24), 'easeInOut')
  )
  .slot('symbol', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(54))
  )
  .build();
```

### Available builders

**Bone:** `scale`, `scaleTo`, `scaleHold`, `translate`, `translateTo`, `translateHold`, `rotate`, `rotateTo`, `rotateHold`

**Slot:** `rgba`, `rgbaTo`, `rgbaHold`, `attachment`, `attachmentAt`

**Curves:** `'linear'` (default) | `'stepped'` | `'easeIn'` | `'easeOut'` | `'easeInOut'` | `[c1x, c1y, c2x, c2y]`

**Time helpers:** `frames(n)` (frames at 60fps → seconds), `seconds(n)` (passthrough)

### Validation

The validator runs at build time and warns on:

- Missing or wrong frame-0 base pose for `idle` / `win` / `landing` (must be scale 1, translate 0, rgba `ffffffff`)
- Loop seam mismatch on any property when `loop: true`
- `destroy` not ending with alpha `00`

To make violations fatal, edit `scripts/animations/index.ts` and pass `{ strict: true }` to `validate()`.

## Loading in pixi-reels

```ts
import { Assets } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';

const NAMES = ['low_a','low_k','low_q','low_j','mid_1','mid_2','mid_3','high_1','wild','scatter'] as const;

await Assets.load({ alias: 'symbols-atlas', src: 'out/symbols.atlas' });
for (const name of NAMES) {
  await Assets.load({ alias: name, src: `out/${name}.json` });
}

const sym = Spine.from({ skeleton: 'low_a', atlas: 'symbols-atlas' });
sym.state.setAnimation(0, 'idle', true);
```

## Verifying

Drop `out/` onto https://spine.schmooky.dev to inspect each skeleton and play all four animations.

## Project layout

```
scripts/
  build-symbols.ts          # entry point
  symbols.config.ts         # 10 symbols, font registry, FPS, Spine version
  animations/               # author DSL animations here
    idle.ts
    win.ts
    landing.ts
    destroy.ts
    index.ts                # compile + validate barrel
  lib/
    dsl/
      builder.ts            # fluent .scale/.scaleTo/.rgba/etc API
      compile.ts            # IR → Spine JSON
      validate.ts           # warn-by-default rule checks
      curves.ts             # named curve presets
      types.ts              # IR types
      index.ts              # public exports
    fonts.ts                # FontLibrary registration
    render.ts               # skia-canvas symbol drawing
    pack.ts                 # maxrects bin packer
    atlas.ts                # libGDX .atlas serializer
    skeleton.ts             # per-symbol JSON builder
```
