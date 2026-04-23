// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .weights({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 3 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker).build();

// One overlay Graphics, redrawn on each spin. Sits above the reel strip
// because reelSet.addChild puts it after viewport in the stacking order.
const overlayGfx = new PIXI.Graphics();
reelSet.addChild(overlayGfx);

function drawCellOutline(col, row, color) {
  const b = reelSet.getCellBounds(col, row);
  overlayGfx
    .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
    .stroke({ color, width: 3, alpha: 1 });
}

function drawPayline(cols, row, color) {
  if (cols.length < 2) return;
  const pts = cols.map(col => {
    const b = reelSet.getCellBounds(col, row);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  overlayGfx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) overlayGfx.lineTo(pts[i].x, pts[i].y);
  overlayGfx.stroke({ color, width: 3, alpha: 0.85 });
}

// Fixed result: middle row is all SEVEN — a full-row payline win.
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
    reelSet.setResult(GRID);
    await p;

    // Let the landing bounce settle.
    await new Promise(r => setTimeout(r, 280));

    // Find SEVEN on WIN_ROW — typically all 5 here.
    const winCols = [];
    for (let col = 0; col < COLS; col++) {
      if (reelSet.getReel(col).getVisibleSymbols()[WIN_ROW] === SEVEN) winCols.push(col);
    }

    // Outline each winning cell + draw a payline through their centres.
    for (const col of winCols) drawCellOutline(col, WIN_ROW, 0xff6b35);
    drawPayline(winCols, WIN_ROW, 0xff6b35);
  },
};
