---
"@pixi-reels/kit": minor
---

Add: `@pixi-reels/kit` is ready to publish (private until its npm scope exists). It holds what the docs recipes run on besides the engine: `tapToSpin` (the canvas as the spin button, with the default round, skip and cue), `createAssets` (the bundled asset kits by name), `readout`, the example symbols and loaders, the recipe contract types, and three subpaths: `@pixi-reels/kit/spine`, `@pixi-reels/kit/sound` (one zvuk engine, the sound set and the default cue tables: `reelSounds`, `boardSounds`) and `@pixi-reels/kit/ways` (moved from `@pixi-reels/cheats/ways`). A recipe copied from the site resolves every import from here. The sound set carries a tick for a split, a shove for a nudge and a sweep for a growing set, wired as default cues on `column:set`, `nudge:start`, `expand:stepAdded`, `reels:added` and `rows:added`, with a soft pop on `pin:placed`; `CUE_STRIP` is the strip under the reels a host keeps clear for the tap cue.
