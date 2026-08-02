// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, app

// `getCellBounds(reel, cell)` on a set that spins sideways.
//
// The call does not change and neither does index space: reel is still reel,
// cell is still cell, and (0, 0) is still the first cell of the first reel. The
// RECT transposes, because a CellBounds is screen space - on a horizontal set
// the reel index walks DOWN the screen and the cell index walks ACROSS it.
//
// The visible consequence: a line drawn through the same cell index on every
// reel runs vertically here, where the identical code draws a horizontal
// payline on a vertical set. Read the rects, do not assume them.

const A = '7', B = '8', C = '9';
const PAY = 'A';

const REELS = 3;  // strips, marching down the screen
const CELLS = 5;  // cells along each strip
const WIN_CELL = 2;

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
  .weights({ [A]: 10, [B]: 10, [C]: 10, [PAY]: 3 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

// Static (reel, cell) tag in the corner of every cell, placed straight from
// getCellBounds. Reel goes down, cell goes right.
const tags = [];
for (let reel = 0; reel < REELS; reel++) {
  for (let cell = 0; cell < CELLS; cell++) {
    const b = reelSet.getCellBounds(reel, cell);
    const tag = new PIXI.Text({
      text: `${reel},${cell}`,
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
    });
    tag.position.set(b.x + 5, b.y + 4);
    tag.alpha = 0.85;
    reelSet.addChild(tag);
    tags.push(tag);
  }
}

const overlayGfx = new PIXI.Graphics();
reelSet.addChild(overlayGfx);

// Cell WIN_CELL of every reel pays. On this axis those three rects stack
// vertically, so the connecting line is vertical.
const GRID = [
  [A, B, PAY, C, A],
  [B, C, PAY, A, B],
  [C, A, PAY, B, C],
];

return {
  reelSet,
  onSpin: async () => {
    overlayGfx.clear();

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(GRID.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 280));

    const pts = [];
    for (let reel = 0; reel < REELS; reel++) {
      const b = reelSet.getCellBounds(reel, WIN_CELL);
      overlayGfx
        .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 8)
        .stroke({ color: 0xff6b35, width: 3 });
      pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    overlayGfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) overlayGfx.lineTo(pts[i].x, pts[i].y);
    overlayGfx.stroke({ color: 0xff6b35, width: 3, alpha: 0.85 });
  },
  cleanup: () => {
    for (const t of tags) t.destroy();
    overlayGfx.destroy();
  },
};
