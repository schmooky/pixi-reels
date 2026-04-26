// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// MxN big symbols — proving the engine handles any rectangular size, not
// just 2×2. Cycles through 1×3, 2×2, 3×3, and 2×4 blocks so each spin
// shows a different shape. Same registration mechanism: SymbolData.size.
//
// The engine auto-picks SharedRectMaskStrategy when big symbols + a
// horizontal symbolGap are present (the default per-reel mask would clip
// the block at every column gap).
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY — see /recipes/card-symbol-debug/.

// Distinct big-symbol palette — each block is a card so cells fill space
// crisply at any block size. Same Graphics class, different registration
// metadata (`size: { w, h }`).
const BIG_SYMBOLS = [
  { id: 'tallBar', color: 0xffb86b, label: 'TALL', textColor: 0x6b3e0a, w: 1, h: 3 },
  { id: 'square',  color: 0xa3e4d7, label: '2x2',  textColor: 0x0e5345, w: 2, h: 2 },
  { id: 'giant',   color: 0xfff3a0, label: '3x3',  textColor: 0x6b5400, w: 3, h: 3 },
  { id: 'wide',    color: 0xf5b7b1, label: '2x4',  textColor: 0x641e16, w: 2, h: 4 },
];
const REELS = 6;
const ROWS = 5;
const SIZE = 70;
const GAP = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .maskStrategy(new SharedRectMaskStrategy())
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
    for (const big of BIG_SYMBOLS) {
      registry.register(big.id, CardSymbol, {
        color: big.color,
        label: big.label,
        textColor: big.textColor,
      });
    }
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  // weight 0 — big symbols are placed by the server (or this demo's
  // nextResult) at anchor cells, never by random fill.
  .symbolData(
    Object.fromEntries(
      BIG_SYMBOLS.map((b) => [b.id, { weight: 0, zIndex: 5, size: { w: b.w, h: b.h } }]),
    ),
  )
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

let spinCount = 0;
return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );

    // Place the next shape at a valid anchor. The engine paints OCCUPIED
    // across the rest of the block.
    const big = BIG_SYMBOLS[spinCount++ % BIG_SYMBOLS.length];
    const maxCol = REELS - big.w;
    const maxRow = ROWS - big.h;
    const col = Math.floor(Math.random() * (maxCol + 1));
    const row = Math.floor(Math.random() * (maxRow + 1));
    grid[col][row] = big.id;

    return grid;
  },
};
