# @pixi-reels/kit

## 0.1.2

### Patch Changes

- [#296](https://github.com/schmooky/pixi-reels/pull/296) [`230fb61`](https://github.com/schmooky/pixi-reels/commit/230fb61b951c93570bce6a6434695aaab5ee3788) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the generic sticker symbols no longer speckle on phones. `loadGenericSymbols` picks the half-size copies whenever the cells come out under about 150 device pixels, which covers small 2x and 3x screens as well as 1x ones. Before, only screens under 1.5x got them.

- [#291](https://github.com/schmooky/pixi-reels/pull/291) [`4da6723`](https://github.com/schmooky/pixi-reels/commit/4da6723e8702ace67cdfa0fd8ef614e2ff8376f3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix: the `tapToSpin` cue reads on a light canvas background. Its plate is now nearly opaque, and the "tap to skip" state fades to 80% instead of 60%.
- Updated dependencies [[`4af027f`](https://github.com/schmooky/pixi-reels/commit/4af027f79b4aadf1b27567ab810641aa1e63493e), [`9f0b508`](https://github.com/schmooky/pixi-reels/commit/9f0b508fd8ec9534a1aaa98860065cd7b19b9c24)]:
  - pixi-reels@4.4.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`05bed07`](https://github.com/schmooky/pixi-reels/commit/05bed07592da0113e3ca2e94ae2fcb06955ecbe1)]:
  - pixi-reels@4.3.1

## 0.1.0

### Minor Changes

- [#278](https://github.com/schmooky/pixi-reels/pull/278) [`4f53570`](https://github.com/schmooky/pixi-reels/commit/4f5357030124c0866c0176d5661f8dfcb5513b6c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add: `@pixi-reels/kit` is ready to publish (private until its npm scope exists). It holds what the docs recipes run on besides the engine: `tapToSpin` (the canvas as the spin button, with the default round, skip and cue), `createAssets` (the bundled asset kits by name), `readout`, the example symbols and loaders, the recipe contract types, and three subpaths: `@pixi-reels/kit/spine`, `@pixi-reels/kit/sound` (one zvuk engine, the sound set and the default cue tables: `reelSounds`, `boardSounds`) and `@pixi-reels/kit/ways` (moved from `@pixi-reels/cheats/ways`). A recipe copied from the site resolves every import from here. The sound set carries a tick for a split, a shove for a nudge and a sweep for a growing set, wired as default cues on `column:set`, `nudge:start`, `expand:stepAdded`, `reels:added` and `rows:added`, with a soft pop on `pin:placed`; `CUE_STRIP` is the strip under the reels a host keeps clear for the tap cue. `StickerSymbol` is one flat sticker on a two-container rig with the studio motion from `playMotion` (`impact` on land, `wowL` with an additive flash and a masked shine on a win); the generic set (`loadGenericSymbols`, `GENERIC_SYMBOL_IDS`, `GENERIC_WEIGHTS`) is eleven such stickers, and the starters spin them through the library's `StaticSpinSymbol` blur. The set also carries seven 9-slice frames for blocks, the 5-slice WILD pillar (`WildPillar`) and `GENERIC_ALIASES` for the card deck's ids; the docs recipes that drew cards draw the stickers now, their block symbols framed.

### Patch Changes

- Updated dependencies []:
  - pixi-reels@4.3.0
