// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Big symbols — register a 2×2 bonus and let the engine paint OCCUPIED
// across the block. The server places the symbol id at the anchor cell only
// (the top-left of the block); the engine fills the rest. Public result
// stays string[][] — block size is registration metadata, not data.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'royal/royal_2'];
const BONUS = 'wild/wild_1';
const REELS = 5;
const ROWS = 4;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of [...FILLER, BONUS]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 22, 'round/round_2': 22,
    'royal/royal_1': 14, 'royal/royal_2': 14,
  })
  // Declare the bonus as 2×2. Default zIndex=5 so it draws above neighbors.
  .symbolData({ [BONUS]: { weight: 1, zIndex: 5, size: { w: 2, h: 2 } } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

let spinCount = 0;
return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    // Drop a 2×2 bonus every other spin so the demo always shows it.
    if (spinCount++ % 2 === 0) {
      const col = Math.floor(Math.random() * (REELS - 1));
      const row = Math.floor(Math.random() * (ROWS - 1));
      grid[col][row] = BONUS;
    }
    return grid;
  },
};
