// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, app, pickWeighted

// Pointer picks on a horizontal set. Hover to preview, click to toggle, picks
// survive spins.
//
// The build loop is the same one the vertical recipe uses - `for reel, for
// cell, getCellBounds(reel, cell)` - and it needs no orientation branch,
// because the rect it hands back is already screen space. The hit boxes land
// where the symbols are on either axis.
//
// **Gotcha (unchanged by the axis):** fill the hit rect with alpha 0, not
// `visible = false`. An invisible-but-filled rect is still hit-testable; a
// hidden one is not.

const REELS = 3;
const CELLS = 5;
const weights = { '7': 20, '8': 18, '9': 16, '10': 12, J: 10, Q: 8, K: 6, A: 5, wild: 3 };

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(96, 72)
  .symbolGap(6, 6)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights(weights)
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

const overlayGfx = new PIXI.Graphics();
reelSet.addChild(overlayGfx);

const picked = new Set();
let hoverKey = null;
const keyOf = (reel, cell) => reel + ',' + cell;

function outline(key, color, width, alpha) {
  const [reel, cell] = key.split(',').map(Number);
  const b = reelSet.getCellBounds(reel, cell);
  overlayGfx
    .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 8)
    .stroke({ color, width, alpha });
}

function redraw() {
  overlayGfx.clear();
  for (const k of picked) outline(k, 0xff6b35, 3, 1);
  if (hoverKey && !picked.has(hoverKey)) outline(hoverKey, 0x666666, 2, 0.55);
}

const hitAreas = [];
for (let reel = 0; reel < REELS; reel++) {
  for (let cell = 0; cell < CELLS; cell++) {
    const b = reelSet.getCellBounds(reel, cell);
    const hit = new PIXI.Graphics();
    hit.rect(b.x, b.y, b.width, b.height).fill({ color: 0xffffff, alpha: 0 });
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    const k = keyOf(reel, cell);
    hit.on('pointerover', () => { hoverKey = k; redraw(); });
    hit.on('pointerout', () => { if (hoverKey === k) hoverKey = null; redraw(); });
    hit.on('pointertap', () => {
      if (picked.has(k)) picked.delete(k);
      else picked.add(k);
      redraw();
    });
    reelSet.addChild(hit);
    hitAreas.push(hit);
  }
}

overlayGfx.zIndex = 9998;
for (const h of hitAreas) h.zIndex = 9999;
reelSet.sortableChildren = true;

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => pickWeighted(weights)),
    ),
  cleanup: () => {
    for (const h of hitAreas) h.destroy();
    overlayGfx.destroy();
  },
};
