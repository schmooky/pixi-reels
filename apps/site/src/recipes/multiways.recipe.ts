// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS,
//                   pickWeighted
//
// MultiWays — per-spin row variation. Each reel can land on a different
// number of rows in the range [minRows, maxRows]. The reel pixel height is
// fixed; cell height per reel is derived (`reelPixelHeight / visibleRows[i]`).
// `setShape(rowsPerReel)` is called between `spin()` and `setResult()`;
// AdjustPhase reshapes the reels before the stop sequence.
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY. CardSymbol is a flat
// Graphics-rect-with-text scaffold from `examples/shared/CardSymbol.ts`
// that always renders crisply at any cell size — perfect for showing how
// MultiWays reshape feels at the cell level. In a real slot, ship
// SpriteSymbol / AnimatedSpriteSymbol / SpineSymbol — see the
// `/recipes/card-symbol-debug/` recipe.

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
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
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const shape = Array.from({ length: REELS }, () =>
      MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
    );
    reelSet.setShape(shape);
    return shape.map((rows) =>
      Array.from({ length: rows }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );
  },
};
