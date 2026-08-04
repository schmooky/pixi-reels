// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   gsap, app, pickWeighted
//
// MultiWays. per-spin cell variation. Each reel lands on a different
// cell count in [minCells, maxCells]. The reel pixel height is fixed;
// cell height per reel is derived live as
// `reelExtent / visibleCells[i]`, so a 2-cell reel has tall cells
// and a 7-cell reel has short ones. `setShape(cellsPerReel)` is called
// between `spin()` and `setResult()`; AdjustPhase reshapes the reels
// between SPIN and STOP.
//
// 6 reels x [2, 7] cells = up to 117,649 distinct landings (7^6). The
// "ways" count for any individual spin is the product of visibleCells
// across reels. Turn on the canvas Debug toggle to read the per-reel
// shape off the overlay's hud layer.

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 360;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minCells: MIN_ROWS, maxCells: MAX_ROWS, reelExtent: REEL_PIXEL_HEIGHT })
  .pinMigrationDuration(300)
  .pinMigrationEase('power2.inOut')
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  // Big symbols overshoot at landing on this layout. set
  // bounceDistance: 0 so each cell snaps flush regardless of which
  // shape was rolled this spin.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const shape = Array.from({ length: REELS }, () =>
      MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
    );
    reelSet.setShape(shape);
    return shape.map((cells) =>
      Array.from({ length: cells }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );
  },
};
