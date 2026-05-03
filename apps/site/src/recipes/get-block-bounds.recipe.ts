// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SharedRectMaskStrategy, PIXI, gsap, app, textures,
//                   blurTextures, SYMBOL_IDS, pickWeighted
//
// getBlockBounds — drawing a single overlay rectangle that hugs an entire
// big-symbol block. Plants a 2×2 (or 1×3 — randomly chosen each spin) and
// outlines it on land. Works the same way for 1×1 cells (in which case
// getBlockBounds === getCellBounds).

const SQUARE = { id: 'square', color: 0xa3e4d7, label: '2×2', textColor: 0x0e5345, w: 2, h: 2 };
const TALL   = { id: 'tall',   color: 0xffb86b, label: '1×3', textColor: 0x6b3e0a, w: 1, h: 3 };
const SHAPES = [SQUARE, TALL];
const REELS = 5;
const ROWS = 4;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .maskStrategy(new SharedRectMaskStrategy())
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
    for (const s of SHAPES) {
      registry.register(s.id, CardSymbol, { color: s.color, label: s.label, textColor: s.textColor });
    }
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData(Object.fromEntries(SHAPES.map((s) => [s.id, { weight: 0, zIndex: 5, size: { w: s.w, h: s.h } }])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// One Graphics overlay redrawn on every spin land.
const overlay = new PIXI.Graphics();
reelSet.addChild(overlay);

let plantedAt = null;
let plantedShape = null;
reelSet.events.on('spin:allLanded', () => {
  overlay.clear();
  if (!plantedAt || !plantedShape) return;
  // Pass the ANCHOR cell. getBlockBounds resolves to the same rect for
  // every cell of the block — anchor or not — so picking any cell works.
  const rect = reelSet.getBlockBounds(plantedAt.col, plantedAt.row);
  overlay
    .roundRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6, 8)
    .stroke({ color: 0xff6b35, width: 4, alpha: 1 });
});

return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );
    plantedShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const col = Math.floor(Math.random() * (REELS - plantedShape.w + 1));
    const row = Math.floor(Math.random() * (ROWS - plantedShape.h + 1));
    grid[col][row] = plantedShape.id;
    plantedAt = { col, row };
    return grid;
  },
};
