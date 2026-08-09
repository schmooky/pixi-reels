// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, ReelSymbol, PIXI, app

// A single value reel: 1 reel, 3 cells, money amounts spinning past.
//
// The pattern behind every prize picker, jackpot ladder and bonus-wheel
// readout: the symbols are not art at all, they are NUMBERS, drawn at runtime.
// Here each cell is nothing but a `PIXI.Text`, and the symbol id IS the amount -
// `setResult([['100.00', ...]])` lands the value you name. No plate, no border,
// no background: just numbers turning on a drum.
//
// It is also the case only `curveMode('warp')` can bend. A `Text` is not a
// texture the engine can hand to a mesh, so the per-symbol projection can do
// nothing but displace and scale it. The warp renders the whole reel to a
// texture first, so the digits themselves curve.
//
// Text is authored big and scaled down to fit, which keeps `1000.00` and
// `5.00` on the same optical size without reflowing the font.

const VALUES = ['5.00', '10.00', '25.00', '50.00', '100.00', '250.00', '1000.00'];

// Rarer as they get bigger, like a real prize ladder.
const WEIGHTS = {
  '5.00': 30, '10.00': 24, '25.00': 18, '50.00': 12,
  '100.00': 8, '250.00': 5, '1000.00': 2,
};

const CELL_W = 260;
const CELL_H = 88;

class ValueSymbol extends ReelSymbol {
  constructor() {
    super();
    this._text = new PIXI.Text({
      text: '',
      style: {
        // Authored large, scaled down in `_fit`. Rasterising once at a big
        // size and shrinking beats re-rasterising per value.
        fontSize: 64,
        fontWeight: '700',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fill: 0xfff6d5,
        letterSpacing: 1,
      },
    });
    this._text.anchor.set(0.5);
    this.view.addChild(this._text);
    this._w = 0;
    this._h = 0;
    this._fitScale = 1;
    this._winTween = null;
  }

  onActivate(symbolId) {
    this._text.text = `$${symbolId}`;
    // Bigger prizes read warmer, so the reel is a ladder at a glance.
    const rank = VALUES.indexOf(symbolId) / (VALUES.length - 1);
    this._text.style.fill = rank > 0.7 ? 0xffcf4d : rank > 0.35 ? 0xf0e2bd : 0xa79b83;
    this._fit();
  }

  onDeactivate() {
    this._killWin();
    this._text.scale.set(this._fitScale);
  }

  async playWin() {
    this._killWin();
    const to = this._fitScale * 1.16;
    return new Promise((resolve) => {
      this._winTween = this.gsap.to(this._text.scale, {
        x: to, y: to, duration: 0.16, yoyo: true, repeat: 1,
        ease: 'power2.inOut', onComplete: resolve,
      });
    });
  }

  stopAnimation() {
    this._killWin();
    this._text.scale.set(this._fitScale);
  }

  resize(width, height) {
    this._w = width;
    this._h = height;
    this._text.x = width / 2;
    this._text.y = height / 2;
    this._fit();
  }

  _fit() {
    if (this._w <= 0 || !this._text.text) return;
    // Reset before measuring, or each fit compounds on the last one's scale.
    this._text.scale.set(1);
    const room = Math.min((this._w - 24) / this._text.width, (this._h - 16) / this._text.height);
    this._fitScale = Math.min(room, 1);
    this._text.scale.set(this._fitScale);
  }

  _killWin() {
    if (this._winTween) {
      this._winTween.kill();
      this._winTween = null;
    }
  }
}

const reelSet = new ReelSetBuilder()
  .reels(1)
  .visibleCells(3)
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 6)
  .curve(0.5)
  .curveMode('warp') // a Text cell has no texture of its own to bend
  .renderer(app.renderer)
  .symbols((r) => {
    for (const v of VALUES) r.register(v, ValueSymbol, {});
  })
  .weights(WEIGHTS)
  // Slow on purpose. A prize reel is read, not raced: the player is following
  // the amounts as they pass, so the strip crawls and takes its time settling.
  .speed('normal', {
    ...SpeedPresets.NORMAL,
    spinSpeed: SpeedPresets.NORMAL.spinSpeed * 0.28,
    accelerationDuration: 700,
    minimumSpinTime: 1200,
    bounceDuration: 700,
  })
  .speed('turbo', {
    ...SpeedPresets.NORMAL,
    spinSpeed: SpeedPresets.NORMAL.spinSpeed * 0.6,
    minimumSpinTime: 600,
  })
  .ticker(app.ticker)
  .build();

const pick = () => {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [v, w] of Object.entries(WEIGHTS)) {
    r -= w;
    if (r <= 0) return v;
  }
  return VALUES[0];
};

return {
  reelSet,
  // One reel, three cells: the middle one is the prize, the neighbours are
  // just the ladder either side of it.
  nextResult: () => [[pick(), pick(), pick()]],
};
