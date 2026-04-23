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

// Overlay for hover / picked outlines. One Graphics, redrawn on change.
const overlayGfx = new PIXI.Graphics();
reelSet.addChild(overlayGfx);

const picked = new Set();
let hoverKey = null;

const keyOf = (c, r) => c + ',' + r;
const parseKey = (k) => k.split(',').map(Number);

function redraw() {
  overlayGfx.clear();
  // Picked cells — solid orange.
  for (const k of picked) {
    const [col, row] = parseKey(k);
    const b = reelSet.getCellBounds(col, row);
    overlayGfx
      .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
      .stroke({ color: 0xff6b35, width: 3, alpha: 1 });
  }
  // Hover cell — soft grey preview (only if not already picked).
  if (hoverKey && !picked.has(hoverKey)) {
    const [col, row] = parseKey(hoverKey);
    const b = reelSet.getCellBounds(col, row);
    overlayGfx
      .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
      .stroke({ color: 0x666666, width: 2, alpha: 0.55 });
  }
}

// Pulse the winning outline when a pick happens.
function pulse(col, row) {
  const b = reelSet.getCellBounds(col, row);
  const pulseGfx = new PIXI.Graphics();
  pulseGfx
    .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
    .stroke({ color: 0xff6b35, width: 3 });
  reelSet.addChild(pulseGfx);
  gsap.fromTo(pulseGfx, { alpha: 0.9 }, { alpha: 0, duration: 0.5 });
  gsap.fromTo(pulseGfx.scale, { x: 1, y: 1 }, {
    x: 1.15, y: 1.15, duration: 0.5,
    onComplete: () => pulseGfx.destroy(),
  });
  // Scale around the cell centre.
  pulseGfx.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
  pulseGfx.position.set(b.x + b.width / 2, b.y + b.height / 2);
}

// Create one invisible hit-area Graphics per cell. eventMode + cursor give
// the pointer-cursor feel; pointertap toggles the pick, pointerover/out
// drive the hover preview.
const hitAreas = [];
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const b = reelSet.getCellBounds(col, row);
    const hit = new PIXI.Graphics();
    // Filled with alpha 0 — invisible but still hit-testable.
    hit.rect(b.x, b.y, b.width, b.height).fill({ color: 0xffffff, alpha: 0 });
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    const k = keyOf(col, row);
    hit.on('pointerover', () => { hoverKey = k; redraw(); });
    hit.on('pointerout', () => { if (hoverKey === k) hoverKey = null; redraw(); });
    hit.on('pointertap', () => {
      if (picked.has(k)) picked.delete(k);
      else { picked.add(k); pulse(col, row); }
      redraw();
    });
    reelSet.addChild(hit);
    hitAreas.push(hit);
  }
}

// Keep hit areas above the symbol layer so clicks always reach them.
overlayGfx.zIndex = 9998;
for (const h of hitAreas) h.zIndex = 9999;
reelSet.sortableChildren = true;

return {
  reelSet,
  onSpin: async () => {
    // Normal spin; picks survive across spins.
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => pickWeighted({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 3 })));
    reelSet.setResult(grid);
    await p;
  },
  cleanup: () => {
    for (const h of hitAreas) h.destroy();
    overlayGfx.destroy();
  },
};
