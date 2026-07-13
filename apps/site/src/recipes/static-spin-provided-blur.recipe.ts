// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpriteSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   app, textures, blurTextures
//
// Bring your own blur art. The round symbols use the hand-authored
// motion-blur strips from the texture atlas (`setStatic` / `setBlurred` —
// the cache treats provided textures as authoritative and never bakes or
// destroys them). The royal symbols have NO blur art in the atlas, so the
// cache auto-bakes theirs. Both kinds spin through the exact same wrapper.

const PROVIDED = ['round/round_1', 'round/round_2', 'round/round_3', 'round/round_4'];
const AUTO = ['royal/royal_1', 'royal/royal_2', 'royal/royal_3', 'royal/royal_4'];
const IDS = [...PROVIDED, ...AUTO];
const SIZE = 90;

const cache = new SpinTextureCache({ renderer: app.renderer });

// Hand-authored art wins: these ids never touch the bake pipeline.
for (const id of PROVIDED) {
  cache.setStatic(id, textures[id]);
  cache.setBlurred(id, blurTextures[id]);
}

const createInner = () => new SpriteSymbol({ textures });

// Prewarm everything — provided ids short-circuit (the cache already has
// them), the royals get captured + baked here instead of on the first spin.
prewarmSpinTextures({
  cache,
  ids: IDS,
  createSymbol: createInner,
  width: SIZE,
  height: SIZE,
});

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleRows(3)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of IDS) {
      r.register(id, StaticSpinSymbol, {
        createInner,
        cache,
        blurRampMs: 120,
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
