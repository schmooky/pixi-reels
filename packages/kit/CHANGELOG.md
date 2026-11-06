# @pixi-reels/kit

## 0.1.0

### Minor Changes

- [#278](https://github.com/schmooky/pixi-reels/pull/278) [`4f53570`](https://github.com/schmooky/pixi-reels/commit/4f5357030124c0866c0176d5661f8dfcb5513b6c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `@pixi-reels/kit` is ready to publish (private until its npm scope exists). It holds what the docs recipes run on besides the engine: `tapToSpin` (the canvas as the spin button, with the default round, skip and cue), `createAssets` (the bundled asset kits by name), `readout`, the example symbols and loaders, the recipe contract types, and three subpaths: `@pixi-reels/kit/spine`, `@pixi-reels/kit/sound` (one zvuk engine, the sound set and the default cue tables: `reelSounds`, `boardSounds`) and `@pixi-reels/kit/ways` (moved from `@pixi-reels/cheats/ways`). A recipe copied from the site resolves every import from here. The sound set carries a tick for a split, a shove for a nudge and a sweep for a growing set, wired as default cues on `column:set`, `nudge:start`, `expand:stepAdded`, `reels:added` and `rows:added`, with a soft pop on `pin:placed`; `CUE_STRIP` is the strip under the reels a host keeps clear for the tap cue. `StickerSymbol` is one flat sticker on a two-container rig with the studio motion from `playMotion` (`impact` on land, `wowL` with an additive flash and a masked shine on a win); the generic set (`loadGenericSymbols`, `GENERIC_SYMBOL_IDS`, `GENERIC_WEIGHTS`) is eleven such stickers, and the starters spin them through the library's `StaticSpinSymbol` blur. The set also carries seven 9-slice frames for blocks, the 5-slice WILD pillar (`WildPillar`) and `GENERIC_ALIASES` for the card deck's ids; the docs recipes that drew cards draw the stickers now, their block symbols framed.

### Patch Changes

- Updated dependencies []:
  - pixi-reels@4.3.0
