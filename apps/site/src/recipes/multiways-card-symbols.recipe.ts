// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS,
//                   pickWeighted
//
// MultiWays with `CardSymbol` (debug Graphics symbol). Each card is drawn
// at runtime as a flat colored rectangle with a centered letter, so cells
// visually fill their entire allotted space — perfect for showing how
// MultiWays reshape feels at the cell level. With sprite atlases you'd
// see textures stretching across reshapes; with Graphics every reshape
// redraws geometry crisply at any size.
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY. CardSymbol is the
// no-asset debug helper from `examples/shared/CardSymbol.ts`. Real slot
// art ships SpriteSymbol / AnimatedSpriteSymbol / SpineSymbol — see the
// `/recipes/card-symbol-debug/` recipe for when (not) to use this class.

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .pinMigrationDuration(0)             // cells snap; only pin overlays would tween
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
