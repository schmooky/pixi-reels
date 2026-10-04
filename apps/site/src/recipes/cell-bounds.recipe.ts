// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, gsap, app, pickWeighted, SilkGraphics

const A = '7', B = '8', C = '9';
const SEVEN = 'A'; // letter-card stand-in. constant kept as SEVEN for readability
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 3 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker).build();

// One overlay, redrawn on each spin. Sits above the reel strip because
// reelSet.addChild puts it after viewport in the stacking order. SilkGraphics
// (pixi-silk) has the Graphics drawing API with exact anti-aliased edges, so
// the rounded outlines and the payline stay smooth at any fitted scale.
const overlayGfx = new SilkGraphics();
reelSet.addChild(overlayGfx);

function drawCellOutline(reel, cell, color) {
  const b = reelSet.getCellBounds(reel, cell);
  overlayGfx
    .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
    .stroke({ color, width: 3, alpha: 1 });
}

function drawPayline(cols, cell, color) {
  if (cols.length < 2) return;
  const pts = cols.map(reel => {
    const b = reelSet.getCellBounds(reel, cell);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  // Translucent, and the joints still do not double-blend.
  overlayGfx.polyline(pts).stroke({ color, width: 3, alpha: 0.85, cap: 'round' });
}

// Fixed result: middle cell is all SEVEN. a full-cell payline win.
const WIN_ROW = 1;
const GRID = [
  [A,     SEVEN, C],
  [C,     SEVEN, A],
  [B,     SEVEN, B],
  [A,     SEVEN, C],
  [SEVEN, SEVEN, A],
];

return {
  reelSet,
  onSpin: async () => {
    // Clear last spin's overlay before the reels start moving.
    overlayGfx.clear();

    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID.map((visible) => ({ visible })));
    await p;

    // Let the landing bounce settle.
    await new Promise(r => setTimeout(r, 280));

    // Find SEVEN on WIN_ROW. typically all 5 here.
    const winCols = [];
    for (let reel = 0; reel < COLS; reel++) {
      if (reelSet.getReel(reel).getVisibleSymbols()[WIN_ROW] === SEVEN) winCols.push(reel);
    }

    // Outline each winning cell + draw a payline through their centres.
    for (const reel of winCols) drawCellOutline(reel, WIN_ROW, 0xff6b35);
    drawPayline(winCols, WIN_ROW, 0xff6b35);
  },
};
