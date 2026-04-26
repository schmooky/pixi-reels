// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Sticky wild on a MultiWays slot. Pin a wild on land with `originRow` set;
// the pin survives every MultiWays reshape. When the next shape is shorter
// than originRow, the pin clamps to the last visible row (`pin:migrated`
// fires with clamped:true). When a later, larger shape can fit the
// originRow again, the pin migrates back — no wander.
//
// Card symbols are drawn from PIXI.Graphics so each cell visually fills
// its full MultiWays-derived size. WILD is a 9th symbol with a star glyph.

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
    // Font size constrained by both height (~55%) and label width (so longer
    // labels like "WILD" or "10" don't overflow narrow cells).
    const labelLen = Math.max(1, this._label.length);
    const fitH = height * 0.55;
    const fitW = (width * 0.78) / (labelLen * 0.55); // 0.55 ~ avg glyph aspect
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
const WILD = { id: 'wild', color: 0xfff3a0, label: 'WILD', textColor: 0x6b5400 };
const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;
const STICKY_TURNS = 3;

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
    registry.register(WILD.id, CardSymbol, { color: WILD.color, label: WILD.label, textColor: WILD.textColor });
  })
  .weights(Object.fromEntries([...CARDS.map((c, i) => [c.id, 12 - i]), [WILD.id, 2]]))
  .symbolData({ [WILD.id]: { weight: 2, zIndex: 5 } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// On every landing, pin every wild for STICKY_TURNS spins. Each pin captures
// its current row as `originRow` automatically — that's what lets the
// engine restore the pin to its original row when shapes grow back.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] !== WILD.id) continue;
      if (reelSet.getPin(c, r)) continue;
      reelSet.pin(c, r, WILD.id, { turns: STICKY_TURNS });
    }
  }
});

// Cycle shapes so the demo deterministically shows clamp + restore.
const SHAPE_CYCLE = [
  [5, 5, 5, 5, 5, 5],
  [3, 3, 3, 3, 3, 3], // shrinks — high-row wilds clamp
  [7, 7, 7, 7, 7, 7], // grows back — clamped wilds migrate back to originRow
  [4, 4, 4, 4, 4, 4],
];
let spinCount = 0;
let plantedWild = false;

return {
  reelSet,
  nextResult: () => {
    const shape = SHAPE_CYCLE[spinCount++ % SHAPE_CYCLE.length];
    reelSet.setShape(shape);
    const grid = shape.map((rows) =>
      Array.from({ length: rows }, () => CARDS[Math.floor(Math.random() * CARDS.length)].id),
    );
    // Plant a wild high up on the first spin so the clamp/restore is visible.
    if (!plantedWild) {
      grid[2][Math.min(4, shape[2] - 1)] = WILD.id;
      plantedWild = true;
    }
    return grid;
  },
};
