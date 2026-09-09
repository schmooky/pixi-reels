// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadSpineSet, PIXI, app, pickWeighted
//
// SYMBOL GRADING: the consumer owns the draw order.
//
// The engine's formula is type-dominant (`symbolData.zIndex * 100 + cell`),
// so an elevated symbol fronts everything below it. Grading specs are the
// other way round: within a grade the LOWER ROW is in front, then the reel to
// the right, and only then does a higher grade win. `symbolZIndex` hands the
// engine that rule and the engine keeps applying it - after every wrap, snap
// and swap, and after the unmask lift on land, which is the moment this
// order becomes visible: every mid and high here is unmasked, so at rest they
// all share one container and the resolver sorts them against each other.
//
// In motion the resolver returns `defaultZIndex`, so the spin looks exactly
// as it did - the grading is an at-rest presentation.

const thunderkick = await loadSpineSet("thunderkick");

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;
const ROWS_PER_REEL = [3, 4, 4, 4, 4, 3];

const spineMap = thunderkick.spineMap;
const weights = {
  low1: 6, low2: 6, low3: 6, low4: 6, low5: 6,
  mid1: 12, mid2: 12, mid3: 12, mid4: 12, high: 10,
};
// The spec: lows ungraded (engine order), mids one grade, high above them.
const GRADE = { mid1: 1, mid2: 1, mid3: 1, mid4: 1, high: 2 };
const UNMASK = Object.fromEntries(Object.keys(GRADE).map((id) => [id, { unmask: true }]));

const cache = new SpinTextureCache({ renderer: app.renderer });
const createInner = () =>
  new SpineReelSymbol({ spineMap, scale: SPINE_SCALE, landingAnimation: 'land', autoPlayLanding: true });

prewarmSpinTextures({
  cache,
  ids: Object.keys(weights),
  createSymbol: createInner,
  width: CELL_W,
  height: CELL_H,
});

const reelSet = new ReelSetBuilder()
  .reels(6)
  .visibleCellsPerReel(ROWS_PER_REEL)
  .reelAnchor('center')
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 0)
  .symbols((r) => {
    for (const id of Object.keys(weights)) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  .symbolData(UNMASK)
  // Row-dominant within a grade: cell * 10 beats reel, grade * 1000 beats both.
  .symbolZIndex((ctx) => {
    if (!ctx.atRest || ctx.visibleCell === null) return ctx.defaultZIndex;
    const grade = GRADE[ctx.symbolId];
    return grade === undefined
      ? ctx.defaultZIndex
      : grade * 1000 + ctx.visibleCell * 10 + ctx.reelIndex;
  })
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .ticker(app.ticker)
  .build();

const hud = new PIXI.Text({
  text: 'at rest: lower row in front, then the reel to the right, high above every mid',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(3 * CELL_W, 4 * CELL_H + 6);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  nextResult: () =>
    ROWS_PER_REEL.map((cells) => Array.from({ length: cells }, () => pickWeighted(weights))),
};
