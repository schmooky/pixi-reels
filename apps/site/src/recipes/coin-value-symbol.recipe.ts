// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, ReelSymbol, PIXI, app
//
// BEGINNER LESSON — carry a numeric value on a coin by building your own
// symbol class.
//
// In pixi-reels a "symbol" is any subclass of `ReelSymbol`. The engine makes
// ONE instance per visible cell and calls a few lifecycle methods on it. To
// make a coin that shows a value we only need to:
//   1. take the value in the constructor,
//   2. draw a coin + the number,
//   3. say where it goes (resize),
//   4. provide the other required methods (here they're tiny no-ops).
//
// `this.view` is the PIXI.Container the engine puts on screen. Whatever you
// add to it is your symbol.
//
// We show the number in the game's GOLD DIGIT bitmap font so it stays crisp
// at any size. Loading the `.fnt` registers the font for PIXI.BitmapText.
await PIXI.Assets.load('/hw-spine/goldfont.fnt'); // font face: "GoldDigits"

class ValueCoin extends ReelSymbol {
  constructor(options) {
    super();
    this.value = options.value;        // <-- the number this coin carries
    this._w = 0;
    this._h = 0;
  }

  // Called when a cell becomes this symbol. Draw the coin here.
  onActivate() {
    this._draw();
  }

  // Called when the cell stops being this symbol. Nothing to clean up here.
  onDeactivate() {}

  // The win/highlight animation. We don't need one for this lesson.
  async playWin() {}

  // Stop any animation and return to rest. Nothing animating here.
  stopAnimation() {}

  // IMPORTANT: resize() runs on EVERY swap with the cell's pixel size, so
  // anything position- or size-related lives here, NOT in the constructor.
  resize(width, height) {
    this._w = width;
    this._h = height;
    this._draw();
  }

  // Draw a gold disc with the value centered on it.
  _draw() {
    if (this._w === 0) return; // resize() hasn't run yet
    this.view.removeChildren();
    const r = Math.min(this._w, this._h) / 2 - 4;
    const coin = new PIXI.Graphics()
      .circle(this._w / 2, this._h / 2, r)
      .fill(0xf6c945)
      .stroke({ color: 0xb8860b, width: 3 });
    this.view.addChild(coin);
    // the number in the gold bitmap font, anchored + positioned dead-center
    const label = new PIXI.BitmapText({ text: String(this.value), style: { fontFamily: 'GoldDigits', fontSize: Math.floor(r * 1.1) } });
    label.anchor.set(0.5);
    if (label.width > r * 1.5) label.scale.set((r * 1.5) / label.width); // fit wide values
    label.position.set(this._w / 2, this._h / 2);
    this.view.addChild(label);
  }
}

// --- use the class on a tiny 3-cell reel ---------------------------------
// Register one variant per value. The value is baked into the registration,
// so `coin5` always carries 5. (The next lesson shows the other way: keeping
// the value in data instead of in the class.)
const VALUES = [1, 2, 5, 10, 20, 50];
const idFor = (v) => `coin${v}`;
const REELS = 3, CELL = 96, GAP = 8;

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleRows(1)
  .symbolSize(CELL, CELL).symbolGap(GAP, GAP)
  .symbols((r) => { for (const v of VALUES) r.register(idFor(v), ValueCoin, { value: v }); })
  .weights(Object.fromEntries(VALUES.map((v) => [idFor(v), 1])))
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();
app.stage.addChild(reelSet);
reelSet.x = (app.screen.width - (REELS * CELL + (REELS - 1) * GAP)) / 2;
reelSet.y = (app.screen.height - CELL) / 2 - 14;

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: '700', fill: 0xfef08a, stroke: { color: 0x000000, width: 3 } },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, reelSet.y + CELL + 16);
app.stage.addChild(hud);

// You can read the value straight off the landed symbol instance:
//   reelSet.reels[col].getSymbolAt(row).value
reelSet.events.on('spin:allLanded', () => {
  const values = reelSet.reels.map((_, c) => reelSet.reels[c].getSymbolAt(0).value);
  const total = values.reduce((a, b) => a + b, 0);
  hud.text = `landed ${values.join(' · ')}  =  ${total}`;
});

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  nextResult: () => Array.from({ length: REELS }, () => [idFor(VALUES[Math.floor(Math.random() * VALUES.length)])]),
};
