// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS,
//                   pickWeighted
//
// Per-reel static shape — a 3-5-5-5-3 pyramid. Reels can have different
// row counts at build time. Cell width is uniform across reels; the
// shorter outer reels are vertically centered by default (`reelAnchor: 'center'`).
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY — see /recipes/card-symbol-debug/.

const VISIBLE = [3, 5, 5, 5, 3];
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(VISIBLE.length)
  .visibleRowsPerReel(VISIBLE)
  .reelAnchor('center')
  .symbolSize(SIZE, SIZE)
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
  nextResult: () =>
    VISIBLE.map((rows) =>
      Array.from({ length: rows }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    ),
};
