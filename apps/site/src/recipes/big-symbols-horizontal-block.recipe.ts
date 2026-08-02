// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, app

// A big symbol on a set that runs sideways.
//
// `size: { reels, cells }` is index space, not screen space, and it does not
// move with the axis: `reels` always spans the reel-marching direction and
// `cells` always spans the strip. On this horizontal set that means the block
// below is 2 reels TALL (2 rows down the screen) and 3 cells WIDE - the same
// declaration would be 2 wide and 3 tall on a vertical set.
//
// `getBlockBounds()` inverts with it. it returns screen space, so the rect it
// hands back for a `{ reels: 2, cells: 3 }` block is wide and short here. The
// outline drawn on land is the proof.

const BLOCK = { id: 'block', color: 0xa3e4d7, label: 'WILD', textColor: 0x0e5345, reels: 2, cells: 3 };
const REELS = 4;   // 4 rows down the screen
const CELLS = 5;   // 5 cells along each row
const SIZE = 64;
const GAP = 4;
const FILLER = ['7', '8', '9', '10', 'J', 'Q'];

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  // One shared rect instead of a per-reel mask: a block spanning two reels
  // is clipped by its anchor reel's mask otherwise.
  .maskStrategy(new SharedRectMaskStrategy())
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
    registry.register(BLOCK.id, CardSymbol, {
      color: BLOCK.color, label: BLOCK.label, textColor: BLOCK.textColor,
    });
  })
  .weights(Object.fromEntries(FILLER.map((id) => [id, 1])))
  .symbolData({
    [BLOCK.id]: { weight: 0, zIndex: 5, size: { reels: BLOCK.reels, cells: BLOCK.cells } },
  })
  // The landing bounce overshoots along the travel axis - sideways here - and
  // a block that wide reads as broken when it does. Zero it.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const outline = new PIXI.Graphics();
reelSet.addChild(outline);

let planted = null;
reelSet.events.on('spin:allLanded', () => {
  outline.clear();
  if (!planted) return;
  const rect = reelSet.getBlockBounds(planted.reel, planted.cell);
  outline
    .roundRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6, 8)
    .stroke({ color: 0xff6b35, width: 4, alpha: 1 });
});

return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    // The anchor is the smallest (reel, cell) corner in index space, which on
    // screen is the block's top-left corner in both orientations.
    const reel = Math.floor(Math.random() * (REELS - BLOCK.reels + 1));
    const cell = Math.floor(Math.random() * (CELLS - BLOCK.cells + 1));
    grid[reel][cell] = BLOCK.id;
    planted = { reel, cell };
    return grid;
  },
  cleanup: () => { try { outline.destroy(); } catch {} },
};
