# @pixi-reels/kit

What the [pixi-reels](https://pixi-reels.schmooky.dev) recipes run on besides the engine. Every recipe on the docs site is a module you can copy into a game as it is; this package is where its imports resolve.

It is not engine API. Each export is a pattern: read it, import it where it fits, copy it where it does not.

It is not on npm yet. Until it is, copy `packages/kit/src` into your project next to `pixi-reels`; the package is built and laid out so that `npm i pixi-reels @pixi-reels/kit` is the only change when it ships.

## What is in it

| Import | Holds |
| --- | --- |
| `@pixi-reels/kit` | `tapToSpin` (the canvas as the spin button), `readout` (plaques and outlines a host can switch off), `createAssets` (the bundled asset kits by name), `StickerSymbol` with the generic set and `playMotion` (one flat sticker, the studio motion on a two-container rig), `BlurSpriteSymbol`, `CoinSymbol`, the sprite loaders, `pickWeighted`, and the `RecipeContext` / `RecipeResult` / `RecipeMeta` types a recipe is written against. |
| `@pixi-reels/kit/spine` | The Spine symbol sets and the Hold & Win skeleton helpers. Pulls the Spine runtime in, so it is its own entry. |
| `@pixi-reels/kit/sound` | One zvuk engine, the eight-file sound set and the default cue tables: `reelSounds(reelSet)`, `boardSounds(board)`. |
| `@pixi-reels/kit/ways` | `evaluateWays` and `countWays`, the pay-ways stand-in a demo uses in place of a server. |

## A recipe

```ts
import { prewarmSpinTextures, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { createAssets, GENERIC_SYMBOL_IDS, GENERIC_WEIGHTS, pickWeighted, StickerSymbol, tapToSpin } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';
import type { RecipeContext, RecipeResult } from '@pixi-reels/kit';

export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  const weights = GENERIC_WEIGHTS;
  // The reels spin a baked motion blur of each sticker: one cache per set, filled up front.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const sticker = () => new StickerSymbol({ textures });
  prewarmSpinTextures({ cache, ids: [...GENERIC_SYMBOL_IDS], createSymbol: sticker, width: 90, height: 90 });
  const reelSet = new ReelSetBuilder()
    .reels(5).visibleCells(3).symbolSize(90, 90).symbolGap(4, 4)
    .symbols((r) => { for (const id of GENERIC_SYMBOL_IDS) r.register(id, StaticSpinSymbol, { createInner: sticker, cache }); })
    .weights(weights)
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker)
    .build();
  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () => Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => pickWeighted(weights))),
  });
  return { reelSet };
}
```

The host passes an `Application` and gets back the set for its debug overlay. The round, the skip, the sounds and the assets are the recipe's own, so the same file runs on the docs site, in Studio, and in your project.

## Assets

`createAssets(baseUrl)` loads the kits the recipes draw with: the prototype sprite atlas, three Spine symbol sets, the Hold & Win sheets. They are served from the docs site's `public/` folder; copy the folders you use next to your game and point `createAssets` at them. The sounds work the same way through `configureSounds({ baseUrl })`.
