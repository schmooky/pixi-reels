// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap, app, textures,
//                   blurTextures, SYMBOL_IDS, pickWeighted
//
// SQUARE big symbol — 2×2. The most common big-symbol shape: bonus icons,
// jackpot reveals, premium symbol art that benefits from extra screen real
// estate without distorting the grid's aspect ratio.

const SQUARE = { id: 'square', color: 0xa3e4d7, label: '2×2', textColor: 0x0e5345, w: 2, h: 2 };
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
    registry.register(SQUARE.id, CardSymbol, {
      color: SQUARE.color, label: SQUARE.label, textColor: SQUARE.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [SQUARE.id]: { weight: 0, zIndex: 5, size: { w: SQUARE.w, h: SQUARE.h } } })
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
    // Always plant the square so the demo always shows the mechanic.
    const col = Math.floor(Math.random() * (REELS - SQUARE.w + 1));
    const row = Math.floor(Math.random() * (ROWS - SQUARE.h + 1));
    grid[col][row] = SQUARE.id;
    return grid;
  },
};
