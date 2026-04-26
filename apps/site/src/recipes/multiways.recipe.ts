// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// MultiWays — per-spin row variation. Each reel can land on a different
// number of rows in the range [minRows, maxRows]. The reel pixel height is
// fixed; cell height per reel is derived (`reelPixelHeight / visibleRows[i]`).
// `setShape(rowsPerReel)` is called between `spin()` and `setResult()`;
// AdjustPhase reshapes the reels before the stop sequence.
//
// Symbols are built from PIXI.Graphics (flat colored rectangles + centered
// letter) so each cell visually fills its full allotted space. With sprite
// textures you'd see scaling artifacts; with Graphics every reshape redraws
// at exactly the new cell size.

class CardSymbol extends ReelSymbol {
  constructor(opts) {
    super();
    this._color = opts.color;
    this._label = opts.label;
    this._textColor = opts.textColor ?? 0xffffff;
    this._gfx = new PIXI.Graphics();
    this._text = new PIXI.Text({
      text: this._label,
      style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: '900', fill: this._textColor },
    });
    this._text.anchor.set(0.5);
    this.view.addChild(this._gfx);
    this.view.addChild(this._text);
  }
  onActivate() {}
  onDeactivate() {}
  async playWin() {
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(this._gfx, { alpha: 0.5, duration: 0.12, ease: 'power1.in' })
        .to(this._gfx, { alpha: 1, duration: 0.12, ease: 'power1.out' })
        .to(this.view.scale, { x: 1.08, y: 1.08, duration: 0.12 }, 0)
        .to(this.view.scale, { x: 1, y: 1, duration: 0.12 }, 0.12);
    });
  }
  stopAnimation() { this.view.scale.set(1, 1); this._gfx.alpha = 1; }
  resize(width, height) {
    this._gfx.clear();
    this._gfx.rect(0, 0, width, height).fill({ color: this._color });
    this._gfx.rect(1, 1, width - 2, height - 2).stroke({ color: 0x000000, width: 2, alpha: 0.25 });
    this._text.x = width / 2;
    this._text.y = height / 2;
    const labelLen = Math.max(1, this._label.length);
    const fitH = height * 0.55;
    const fitW = (width * 0.78) / (labelLen * 0.55);
    this._text.style.fontSize = Math.max(8, Math.floor(Math.min(fitH, fitW)));
  }
}

const CARDS = [
  { id: '7',  color: 0xc0392b, label: '7' },
  { id: '8',  color: 0xe67e22, label: '8' },
  { id: '9',  color: 0xf1c40f, label: '9' },
  { id: '10', color: 0x27ae60, label: '10' },
  { id: 'J',  color: 0x16a085, label: 'J' },
  { id: 'Q',  color: 0x2980b9, label: 'Q' },
  { id: 'K',  color: 0x8e44ad, label: 'K' },
  { id: 'A',  color: 0x2c3e50, label: 'A' },
];
const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .adjustDuration(300)
  .adjustEase('power2.inOut')
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARDS) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
  })
  .weights(Object.fromEntries(CARDS.map((c, i) => [c.id, 12 - i])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () => {
    const shape = Array.from({ length: REELS }, () =>
      MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
    );
    reelSet.setShape(shape);
    return shape.map((rows) =>
      Array.from({ length: rows }, () => CARDS[Math.floor(Math.random() * CARDS.length)].id),
    );
  },
};
