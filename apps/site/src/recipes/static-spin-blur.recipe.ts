// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StaticSpinSymbol,
//                   SpinTextureCache, prewarmSpinTextures,
//                   CardSymbol, CARD_DECK, WILD_CARD, app, pickWeighted
//
// Auto-baked motion blur: no blur art exists anywhere in this demo. Each
// card is snapshotted once into a RenderTexture, a vertical smear is baked
// from it in a single offline BlurFilter pass, and the reel spins those
// cached textures. Zero filters run per frame while spinning.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const SIZE = 90;

const weights = {
  '7': 20, '8': 20, '9': 20,
  '10': 14, J: 14,
  Q: 10, K: 6, A: 5,
  wild: 3,
};

// One cache for the whole reel set; snapshots are shared across every
// cell and every spin.
const cache = new SpinTextureCache({ renderer: app.renderer });

// Bake every card up front so the first spin never pays a capture hitch.
// CardSymbol draws from its constructor options, so each id gets its own
// scratch symbol; atlas/Spine symbols can prewarm all ids in one call.
for (const sym of SYMBOLS) {
  prewarmSpinTextures({
    cache,
    ids: [sym.id],
    createSymbol: () =>
      new CardSymbol({ color: sym.color, label: sym.label, textColor: sym.textColor }),
    width: SIZE,
    height: SIZE,
  });
}

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleRows(3)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, StaticSpinSymbol, {
        createInner: () =>
          new CardSymbol({ color: sym.color, label: sym.label, textColor: sym.textColor }),
        cache,
        blurRampMs: 140, // crisp→blurred crossfade synced with the acceleration
      });
    }
  })
  .weights(weights)
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    ),
};
