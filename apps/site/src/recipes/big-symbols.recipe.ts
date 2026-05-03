// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Big symbols — register a 2×2 bonus and let the engine paint OCCUPIED
// across the block. The server places the symbol id at the anchor cell only
// (the top-left of the block); the engine fills the rest. Public result
// stays string[][] — block size is registration metadata, not data.
//
// The engine auto-picks SharedRectMaskStrategy when big symbols + a
// horizontal symbolGap are present. The explicit call below documents
// the choice; auto-pick would handle it anyway.
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY — see /recipes/card-symbol-debug/.

// Bonus is the "big" symbol — same Graphics class, just registered with size 2x2.
const BONUS = { id: 'bonus', color: 0xfff3a0, label: 'BONUS', textColor: 0x6b5400 };
const REELS = 5;
const ROWS = 4;
const SIZE = 80;
const GAP = 4;

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
    registry.register(BONUS.id, CardSymbol, {
      color: BONUS.color,
      label: BONUS.label,
      textColor: BONUS.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  // Big symbols (size > 1x1) MUST have weight 0 — placed by the server
  // at anchor cells only, never by random fill.
  .symbolData({ [BONUS.id]: { weight: 0, zIndex: 5, size: { w: 2, h: 2 } } })
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
    // Drop a 2×2 bonus every other spin so the demo always shows it.
    if (spinCount++ % 2 === 0) {
      const col = Math.floor(Math.random() * (REELS - 1));
      const row = Math.floor(Math.random() * (ROWS - 1));
      grid[col][row] = BONUS.id;
    }
    return grid;
  },
};
