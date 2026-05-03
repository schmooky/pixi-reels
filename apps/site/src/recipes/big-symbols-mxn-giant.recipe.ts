// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap, app, textures,
//                   blurTextures, SYMBOL_IDS, pickWeighted
//
// GIANT big symbol — 3×3. Mid-board feature anchor: jackpot reveal panels,
// "free spins triggered" overlays, large character art. Eats nine cells out
// of a 6×5 grid, so weight 0 and place sparingly via the server.

const GIANT = { id: 'giant', color: 0xfff3a0, label: 'GIANT', textColor: 0x6b5400, w: 3, h: 3 };
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
    registry.register(GIANT.id, CardSymbol, {
      color: GIANT.color, label: GIANT.label, textColor: GIANT.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [GIANT.id]: { weight: 0, zIndex: 5, size: { w: GIANT.w, h: GIANT.h } } })
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
    const col = Math.floor(Math.random() * (REELS - GIANT.w + 1));
    const row = Math.floor(Math.random() * (ROWS - GIANT.h + 1));
    grid[col][row] = GIANT.id;
    return grid;
  },
};
