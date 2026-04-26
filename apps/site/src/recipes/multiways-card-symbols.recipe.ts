// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// MultiWays with custom Graphics symbols. Each card symbol is drawn at
// runtime as a flat rectangle (no rounded corners) with a centered letter,
// so cells visually fill their entire allotted space — exactly what
// happens when MultiWays reshapes from 2 to 7 rows. With sprite atlases
// you'd see textures stretching; here you see how the engine actually
// hands cells the full cell rectangle.

class CardSymbol extends ReelSymbol {
  constructor(opts) {
    super();
    this._color = opts.color;
    this._label = opts.label;
    this._textColor = opts.textColor ?? 0xffffff;
    this._gfx = new PIXI.Graphics();
    this._text = new PIXI.Text({
      text: this._label,
      style: {
        fontFamily: 'Georgia, serif',
        fontSize: 48,
        fontWeight: '900',
        fill: this._textColor,
        align: 'center',
      },
    });
    this._text.anchor.set(0.5);
    this.view.addChild(this._gfx);
    this.view.addChild(this._text);
  }
  onActivate() {}
  onDeactivate() {}
  async playWin() {
    // Brief flash + scale pulse so wins are obvious on the colored bricks.
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(this._gfx, { alpha: 0.5, duration: 0.12, ease: 'power1.in' })
        .to(this._gfx, { alpha: 1, duration: 0.12, ease: 'power1.out' })
        .to(this.view.scale, { x: 1.08, y: 1.08, duration: 0.12 }, 0)
        .to(this.view.scale, { x: 1, y: 1, duration: 0.12 }, 0.12);
    });
  }
  stopAnimation() {
    this.view.scale.set(1, 1);
    this._gfx.alpha = 1;
  }
  resize(width, height) {
    this._gfx.clear();
    this._gfx.rect(0, 0, width, height).fill({ color: this._color });
    // Inner darker stroke so adjacent cells are visually separated even
    // when they share the same color row.
    this._gfx.rect(1, 1, width - 2, height - 2).stroke({ color: 0x000000, width: 2, alpha: 0.25 });
    this._text.x = width / 2;
    this._text.y = height / 2;
    // Font size constrained by both height (~55%) and label width (so "10"
    // doesn't overflow narrow cells). Stays readable across all MultiWays
    // shapes (tall narrow cells at 7 rows, short wide cells at 2 rows).
    const labelLen = Math.max(1, this._label.length);
    const fitH = height * 0.55;
    const fitW = (width * 0.78) / (labelLen * 0.55);
    this._text.style.fontSize = Math.max(8, Math.floor(Math.min(fitH, fitW)));
  }
}

const CARDS = [
  { id: '7',  color: 0xc0392b, label: '7' },   // crimson
  { id: '8',  color: 0xe67e22, label: '8' },   // orange
  { id: '9',  color: 0xf1c40f, label: '9' },   // amber
  { id: '10', color: 0x27ae60, label: '10' },  // green
  { id: 'J',  color: 0x16a085, label: 'J' },   // teal
  { id: 'Q',  color: 0x2980b9, label: 'Q' },   // blue
  { id: 'K',  color: 0x8e44ad, label: 'K' },   // purple
  { id: 'A',  color: 0x2c3e50, label: 'A' },   // navy
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
  .adjustDuration(0)             // cells snap; only pin overlays would tween
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
