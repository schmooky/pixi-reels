// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadThunderkickSpines, buildThunderkickSpineMap,
//                   app, pickWeighted
//
// Jagged layouts can't use `unmask` (the builder throws - the motion layer
// can't keep unmasked views aligned on offset reels). The pattern instead:
// PROMOTE each landed scatter's view into viewport.spotlightContainer (the
// same above-mask layer the win spotlight uses), and hand it back to its
// reel on the next spin:start. Above every reel, outside the mask, and the
// symbol pool is built to tolerate exactly this re-parenting.

await loadThunderkickSpines();

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;

const spineMap = buildThunderkickSpineMap();

const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6, high: 4,
};

const ROWS_PER_REEL = [3, 4, 4, 4, 4, 3];

const cache = new SpinTextureCache({ renderer: app.renderer });
const createInner = () =>
  new SpineReelSymbol({
    spineMap,
    scale: SPINE_SCALE,
    landingAnimation: 'land',
    autoPlayLanding: true,
  });

prewarmSpinTextures({
  cache,
  ids: [...Object.keys(weights), 'scatter'],
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
    for (const id of [...Object.keys(weights), 'scatter']) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  // Still useful while landing: elevates the scatter within its own reel.
  .symbolData({ scatter: { zIndex: 10 } })
  // Synchronized settle: all reels start and stop together (no stagger),
  // and land with no bounce so the whole grid comes to rest as one.
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, spinDelay: 0, stopDelay: 0, bounceDistance: 0 })
  .ticker(app.ticker)
  .build();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let scatterCells = [];
const promoted = [];
let spinGen = 0; // stale-timer guard: bumped on every spin:start

function promoteScatter(reel, row) {
  const sym = reelSet.getReel(reel).getSymbolAt(row);
  if (!sym) return;
  const view = sym.view;
  const layer = reelSet.viewport.spotlightContainer;
  if (view.parent === layer) return;
  const globalPos = view.getGlobalPosition();
  promoted.push({ view, parent: view.parent, x: view.x, y: view.y });
  layer.addChild(view);
  view.position.copyFrom(layer.toLocal(globalPos));
}

reelSet.events.on('spin:reelLanded', (reelIndex) => {
  const landed = scatterCells.filter((c) => c.reel === reelIndex);
  if (landed.length === 0) return;
  const gen = spinGen;
  // Let the stop bounce settle before lifting the view out of the reel.
  sleep(380).then(() => {
    if (gen !== spinGen) return;
    for (const c of landed) promoteScatter(c.reel, c.row);
  });
});

reelSet.events.on('spin:start', () => {
  spinGen++;
  // Hand every promoted view back to its reel before the strip moves.
  for (const p of promoted) {
    p.parent.addChild(p.view);
    p.view.position.set(p.x, p.y);
  }
  promoted.length = 0;
});

return {
  reelSet,
  nextResult: () => {
    const grid = ROWS_PER_REEL.map((cells) =>
      Array.from({ length: cells }, () => pickWeighted(weights)),
    );
    // Scatters on the short edge reels + one tall middle reel: the promoted
    // jaws overflow the mask at the grid's stepped edges AND the reel to
    // their right.
    scatterCells = [];
    for (const reel of [0, 3, 5]) {
      const row = Math.floor(Math.random() * grid[reel].length);
      grid[reel][row] = 'scatter';
      scatterCells.push({ reel, row });
    }
    return grid;
  },
};
