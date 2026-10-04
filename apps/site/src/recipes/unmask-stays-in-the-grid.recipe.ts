// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   ReelSymbol, PIXI, app, SilkGraphics, DebugPlaque
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

// One plaque for all three captions: three separate plates would stack too
// tall to clear the marker below. Swatches key each row to what it describes
// on the board: the plate's violet (too dark for text on the plaque) and the
// marker's grey.
const captions = new DebugPlaque({
  title: 'same symbol, one cell apart',
  rows: [
    { text: 'reel 1, top VISIBLE cell: lifted, overflows the grid', swatch: 0x7c3aed },
    { text: 'reel 3, BUFFER cell above: clipped by the mask at the grid edge', color: 0x94a3b8, swatch: 0x94a3b8 },
  ],
});
stage.addChild(captions);

// Mark where the buffered plate actually is, since the point of it is what
// you canNOT see. The dashes sit one cell above the grid, over reel 3.
const ghost = new SilkGraphics();
const gx = 3 * (SIZE + GAP);
const ghostY = PAD_TOP - SIZE - GAP + SIZE / 2;
ghost.line(gx + 6, ghostY, gx + SIZE - 6, ghostY)
  .stroke({ width: 2, color: 0x94a3b8, dash: [6, 8], cap: 'round' });
const ghostLabel = new DebugPlaque({
  text: 'plate is parked here',
  fontSize: 9,
  color: 0x94a3b8,
  anchor: { x: 0.5, y: 0 },
});
ghostLabel.position.set(gx + SIZE / 2, ghostY + 6);
stage.addChild(ghost, ghostLabel);

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
