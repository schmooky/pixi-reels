// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// MxN big symbols — proving the engine handles any rectangular size, not
// just 2×2. Cycles through 1×3, 2×2, 3×3, and 2×4 blocks so each spin
// shows a different shape. Same registration mechanism: SymbolData.size.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'royal/royal_2'];
const TALL_BAR = 'royal/royal_3';   // 1×3
const SQUARE = 'royal/royal_4';     // 2×2
const GIANT  = 'wild/wild_1';       // 3×3
const WIDE   = 'square/square_1';   // 2×4
const REELS = 6;
const ROWS = 5;
const SIZE = 70;
const GAP = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of [...FILLER, TALL_BAR, SQUARE, GIANT, WIDE]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 24, 'round/round_2': 24,
    'royal/royal_1': 16, 'royal/royal_2': 16,
  })
  // Each big symbol declares its block via { size: { w, h } }.
  // zIndex lifts them above 1×1 neighbors at the cell where the anchor lives.
  .symbolData({
    // weight 0 — big symbols are placed by the server (or this demo's
    // nextResult) at anchor cells, never by random fill.
    [TALL_BAR]: { weight: 0, zIndex: 5, size: { w: 1, h: 3 } },
    [SQUARE]:   { weight: 0, zIndex: 5, size: { w: 2, h: 2 } },
    [GIANT]:    { weight: 0, zIndex: 5, size: { w: 3, h: 3 } },
    [WIDE]:     { weight: 0, zIndex: 5, size: { w: 2, h: 4 } },
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Cycle through every shape so the demo is deterministic.
const SHAPES: Array<{ id: string; w: number; h: number }> = [
  { id: TALL_BAR, w: 1, h: 3 },
  { id: SQUARE,   w: 2, h: 2 },
  { id: GIANT,    w: 3, h: 3 },
  { id: WIDE,     w: 2, h: 4 },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const grid: string[][] = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );

    // Place the next shape at a valid anchor. The engine will paint OCCUPIED
    // across the rest of the block; whatever's at those cells in the input
    // grid is overwritten internally.
    const shape = SHAPES[spinCount++ % SHAPES.length];
    const maxCol = REELS - shape.w;
    const maxRow = ROWS - shape.h;
    const col = Math.floor(Math.random() * (maxCol + 1));
    const row = Math.floor(Math.random() * (maxRow + 1));
    grid[col][row] = shape.id;

    return grid;
  },
};
