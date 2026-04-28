// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap, app, textures,
//                   blurTextures, SYMBOL_IDS, pickWeighted
//
// WIDE big symbol — 2×4. Two columns wide, four rows tall — a banner-shaped
// block. Useful for "feature triggered" splash panels that need to span
// adjacent reels but don't want to dominate the whole board the way a 3×3
// giant does. Demands a tall enough grid (rows >= 4).

const WIDE = { id: 'wide', color: 0xf5b7b1, label: 'WIDE', textColor: 0x641e16, w: 2, h: 4 };
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
    registry.register(WIDE.id, CardSymbol, {
      color: WIDE.color, label: WIDE.label, textColor: WIDE.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [WIDE.id]: { weight: 0, zIndex: 5, size: { w: WIDE.w, h: WIDE.h } } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );
    const col = Math.floor(Math.random() * (REELS - WIDE.w + 1));
    const row = Math.floor(Math.random() * (ROWS - WIDE.h + 1));
    grid[col][row] = WIDE.id;
    return grid;
  },
};
