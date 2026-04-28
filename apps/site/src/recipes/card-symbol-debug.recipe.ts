// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS,
//                   pickWeighted
//
// CardSymbol prototyping demo — a classic 5×3 layout using the importable
// debug Graphics symbol from `examples/shared/CardSymbol.ts`. No textures,
// no atlases, no loaders. Each card is a flat colored rectangle with a
// centered letter that always renders crisply at any cell size.
//
// USE THIS FOR PROTOTYPING ONLY. CardSymbol is debug scaffolding — your
// real game ships SpriteSymbol, AnimatedSpriteSymbol, or SpineSymbol.
// See the recipe page for when (not) to use this class.

const REELS = 5;
const ROWS = 3;
const SIZE = 120;
const GAP = 6;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
  })
  // Weighted by rank so high cards (A, K, Q) are rarer than low cards.
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    ),
};
