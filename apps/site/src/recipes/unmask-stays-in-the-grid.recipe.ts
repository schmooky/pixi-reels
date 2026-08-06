// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   ReelSymbol, PIXI, app
//
// `unmask: true` lifts VISIBLE cells only.
//
// An unmasked symbol is parented to the viewport-wide unmasked container on
// land, so art wider than its cell can overflow the grid instead of being
// clipped. That is a presentation for a cell the player is looking at: the
// same id sitting in a BUFFER cell stays under the mask, because a buffer
// cell is parked outside the window precisely so nobody sees it.
//
// Both cases are on screen at once below. Same symbol, one cell apart.

const PLATE = 'plate';
const FILLER = ['7', '8', '9', '10'];

const COLS = 4, ROWS = 3, SIZE = 88, GAP = 6;
const GRID_W = COLS * (SIZE + GAP) - GAP;
const GRID_H = ROWS * (SIZE + GAP) - GAP;

// A deliberately oversized symbol: 1.7x its cell in both directions, so a
// lifted one overflows the grid edge and its neighbours, and a masked one
// would be impossible to miss if it ever leaked.
class PlateSymbol extends ReelSymbol {
  onActivate() {
    this._draw();
  }
  onDeactivate() {}
  async playWin() {}
  stopAnimation() {}
  resize(width, height) {
    this._w = width;
    this._h = height;
    this._draw();
  }
  _draw() {
    if (!this._w) return;
    this.view.removeChildren();
    const w = this._w * 1.7;
    const h = this._h * 1.7;
    const x = (this._w - w) / 2;
    const y = (this._h - h) / 2;
    this.view.addChild(
      new PIXI.Graphics()
        .roundRect(x, y, w, h, 14)
        .fill({ color: 0x7c3aed })
        .stroke({ color: 0xfef08a, width: 4 }),
    );
    const label = new PIXI.Text({
      text: 'JACKPOT',
      style: { fontFamily: 'ui-monospace, monospace', fontSize: 15, fontWeight: '900', fill: 0xfef08a },
    });
    label.anchor.set(0.5);
    label.x = this._w / 2;
    label.y = this._h / 2;
    this.view.addChild(label);
  }
}

const spare = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const result = () => [
  { visible: [spare(), spare(), spare()] },
  // Visible cell 0 -> lifted above the mask on land.
  { visible: [PLATE, spare(), spare()] },
  { visible: [spare(), spare(), spare()] },
  // Buffer cell above the window -> masked, invisible, and it must stay that
  // way through a skip as well: hit SPIN then SKIP and nothing pops out.
  { visible: [spare(), spare(), spare()], bufferStart: [PLATE] },
];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .bufferSymbols(1)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
    r.register(PLATE, PlateSymbol, {});
  })
  // The plate is never drawn at random: it only ever lands where the result
  // puts it. A pool is the tidy way to say so.
  .randomSymbols({ exclude: [PLATE] })
  .symbolData({ [PLATE]: { unmask: true, zIndex: 10 } })
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 900 })
  .initialFrame(result())
  .ticker(app.ticker)
  .build();

// --- Captions ----------------------------------------------------------
// The lifted plate overflows ABOVE the grid, and the buffer cell it is
// compared against sits above it too, so the composition needs real headroom.
// One root with the reels pushed down, returned as `stage`.
const PAD_TOP = 118;
const stage = new PIXI.Container();
reelSet.y = PAD_TOP;
stage.addChild(reelSet);

const caption = (text, color, x, y, anchorX) => {
  const t = new PIXI.Text({
    text,
    style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: '700', fill: color },
  });
  t.anchor.set(anchorX, 0);
  t.x = x;
  t.y = y;
  stage.addChild(t);
  return t;
};

caption('same symbol, one cell apart', 0x475569, 0, 0, 0);
caption('reel 1, top VISIBLE cell: lifted, overflows the grid', 0x7c3aed, 0, 16, 0);
caption('reel 3, BUFFER cell above: clipped by the mask at the grid edge', 0x94a3b8, 0, 32, 0);

// Mark where the buffered plate actually is, since the point of it is what
// you canNOT see. The dashes sit one cell above the grid, over reel 3.
const ghost = new PIXI.Graphics();
const gx = 3 * (SIZE + GAP);
const ghostY = PAD_TOP - SIZE - GAP + SIZE / 2;
for (let i = 0; i < 6; i++) {
  ghost.rect(gx + i * (SIZE / 6) + 3, ghostY, SIZE / 12, 2);
}
ghost.fill({ color: 0x94a3b8 });
const ghostLabel = caption('plate is parked here', 0x94a3b8, gx + SIZE / 2, ghostY + 6, 0.5);
ghostLabel.style.fontSize = 9;
stage.addChild(ghost);

return {
  reelSet,
  stage,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(result());
    await p;
  },
};
