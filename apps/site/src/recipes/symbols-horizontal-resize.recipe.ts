// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelSymbol, PIXI, app,
//                   pickWeighted

// Authoring a symbol for a set that spins sideways. The answer is: author it
// exactly as you would for a vertical set.
//
// `resize(width, height)` is SCREEN space in every orientation. `width` is
// pixels across the screen and `height` is pixels down it, whichever way the
// strip travels. The engine never rotates a symbol container to fake an axis -
// travel changes motion, facing changes art, and neither one changes the other.
// The plate below draws an upright "TOP" bar and an upright glyph, and both
// stay upright while the strip scrolls along X.
//
// The one orientation fact a symbol gets is `this.mainAxis`: 'y' on a vertical
// set, 'x' on a horizontal one. It exists for effects that genuinely follow
// travel (motion blur is the one in the box), not for layout. The chevron below
// uses it to point along travel without knowing the set's orientation.

class PlateSymbol extends ReelSymbol {
  constructor(options) {
    super();
    this._color = options.color;
    this._label = options.label;
    this._w = 0;
    this._h = 0;
  }

  onActivate() { this._draw(); }
  onDeactivate() {}
  async playWin() {}
  stopAnimation() {}

  // Runs on every symbol swap, with the cell's pixel size. Screen-space, both
  // orientations: here 110 wide by 70 tall.
  resize(width, height) {
    this._w = width;
    this._h = height;
    this._draw();
  }

  _draw() {
    if (this._w === 0) return;
    this.view.removeChildren();

    const plate = new PIXI.Graphics()
      .roundRect(2, 2, this._w - 4, this._h - 4, 8)
      .fill(this._color)
      .stroke({ color: 0x000000, width: 2, alpha: 0.35 });
    // An upright marker along the TOP screen edge. It stays at the top on a
    // horizontal set, because screen space is screen space.
    plate.rect(10, 6, this._w - 20, 4).fill({ color: 0xffffff, alpha: 0.7 });
    this.view.addChild(plate);

    const text = new PIXI.Text({
      text: this._label,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fontWeight: '700', fill: 0xffffff },
    });
    text.anchor.set(0.5);
    text.position.set(this._w / 2, this._h / 2 - 4);
    this.view.addChild(text);

    const size = new PIXI.Text({
      text: `${Math.round(this._w)}x${Math.round(this._h)}`,
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0xffffff },
    });
    size.anchor.set(0.5, 1);
    size.alpha = 0.75;
    size.position.set(this._w / 2, this._h - 5);
    this.view.addChild(size);

    // Travel-aware decoration: a chevron on the axis this set spins along.
    // `mainAxis` is bound by the engine when the symbol is created.
    const chevron = new PIXI.Graphics();
    if (this.mainAxis === 'x') {
      chevron.moveTo(8, this._h / 2 - 6).lineTo(14, this._h / 2).lineTo(8, this._h / 2 + 6);
    } else {
      chevron.moveTo(this._w / 2 - 6, 12).lineTo(this._w / 2, 18).lineTo(this._w / 2 + 6, 12);
    }
    chevron.stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
    this.view.addChild(chevron);
  }
}

const PLATES = [
  { id: 'ruby', color: 0xc0392b, label: 'R' },
  { id: 'amber', color: 0xe67e22, label: 'A' },
  { id: 'jade', color: 0x16a085, label: 'J' },
  { id: 'ocean', color: 0x2980b9, label: 'O' },
  { id: 'plum', color: 0x8e44ad, label: 'P' },
];

const REELS = 3;
const CELLS = 4;
const weights = Object.fromEntries(PLATES.map((p) => [p.id, 10]));

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(110, 70) // wide cells. the strip advances by the 110px width
  .symbolGap(6, 6)
  .symbols((r) => {
    for (const p of PLATES) r.register(p.id, PlateSymbol, { color: p.color, label: p.label });
  })
  .weights(weights)
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => pickWeighted(weights)),
    ),
};
