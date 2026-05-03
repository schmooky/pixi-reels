// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap, app, textures,
//                   blurTextures, SYMBOL_IDS, pickWeighted
//
// TALL big symbol — 1×3. One column wide, three rows tall. Reads as a
// "stacked" symbol: think gold-bar towers, totems, or vertical wild
// columns that span the visible area without occupying neighbouring reels.

const TALL = { id: 'tall', color: 0xffb86b, label: 'TALL', textColor: 0x6b3e0a, w: 1, h: 3 };
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
    registry.register(TALL.id, CardSymbol, {
      color: TALL.color, label: TALL.label, textColor: TALL.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { w: TALL.w, h: TALL.h } } })
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
    const col = Math.floor(Math.random() * (REELS - TALL.w + 1));
    const row = Math.floor(Math.random() * (ROWS - TALL.h + 1));
    grid[col][row] = TALL.id;
    return grid;
  },
};
