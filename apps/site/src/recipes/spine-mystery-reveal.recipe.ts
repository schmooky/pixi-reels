// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadThunderkickSpines, buildThunderkickSpineMap,
//                   THUNDERKICK_SYMBOL_IDS, app, pickWeighted, Spine, PIXI
//
// Mystery reveal: bushes land with their own `land` one-shot, then each
// plays the rig's `revealWin` on an overlay spine while the cell underneath
// swaps to the round's shared target symbol via `activate()`.
// Every reveal animation fades the bush to fully transparent, so the
// overlay destroys itself on complete.

await loadThunderkickSpines();

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;

const spineMap = buildThunderkickSpineMap();

// Base fill and reveal targets: paying symbols only. Mysteries are forced
// into the grid below so every spin demonstrates the reveal.
const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6,
  high: 4, wild: 3,
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
  ids: [...Object.keys(weights), 'mystery'],
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
    for (const id of [...Object.keys(weights), 'mystery']) {
      r.register(id, StaticSpinSymbol, {
        createInner,
        cache,
        blurRampMs: 160,
      });
    }
  })
  .weights(weights)
  // Mystery bush and wild art overflow their 175x203 tile, keep them
  // painted above neighbouring cells.
  .symbolData({ mystery: { zIndex: 6 }, wild: { zIndex: 5 } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Bush overlays live above the (masked) reels, in reelSet coordinates, so
// the reveal art can overflow its tile the way the rig authored it.
const overlayLayer = new PIXI.Container();
reelSet.addChild(overlayLayer);

let lastGrid = null;

function nextResult() {
  const grid = ROWS_PER_REEL.map((rows) =>
    Array.from({ length: rows }, () => pickWeighted(weights)),
  );
  // Force 2-4 mysteries per spin so the reveal always shows.
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const reel = Math.floor(Math.random() * grid.length);
    const row = Math.floor(Math.random() * grid[reel].length);
    grid[reel][row] = 'mystery';
  }
  lastGrid = grid;
  return grid;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

reelSet.events.on('spin:start', () => {
  // A re-spin during a reveal: drop any bushes still animating.
  for (const child of [...overlayLayer.children]) child.destroy();
});

reelSet.events.on('spin:complete', async () => {
  if (!lastGrid) return;
  const cells = [];
  lastGrid.forEach((col, reel) =>
    col.forEach((id, row) => {
      if (id === 'mystery') cells.push({ reel, row });
    }),
  );
  if (cells.length === 0) return;

  // One shared outcome per round, every bush hides the same symbol.
  const target = pickWeighted(weights);

  // Let the bushes' `land` one-shot (0.33s) finish first.
  await sleep(650);

  for (const c of cells) {
    const sym = reelSet.getReel(c.reel).getSymbolAt(c.row);
    if (!sym) continue;

    const bush = Spine.from({
      skeleton: spineMap.mystery.skeleton,
      atlas: spineMap.mystery.atlas,
    });
    bush.scale.set(SPINE_SCALE);
    const pos = overlayLayer.toLocal(sym.view.getGlobalPosition());
    bush.position.set(pos.x + CELL_W / 2, pos.y + CELL_H / 2);
    overlayLayer.addChild(bush);
    bush.state.setAnimation(0, 'revealWin', false);
    bush.update(0);

    // The bush fully covers the tile until its `explode` event (0.83s), so
    // swapping the cell now is invisible; by the time the reveal parts the
    // leaves, the real symbol is already underneath.
    sym.activate(target);

    bush.state.addListener({
      complete: () => {
        if (!bush.destroyed) bush.destroy();
      },
    });
  }
});

return { reelSet, nextResult };
