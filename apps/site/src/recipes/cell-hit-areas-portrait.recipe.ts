// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

// Non-square (portrait) cells: 70w x 105h — a 2:3 ratio typical for
// character-art symbols. Everything the cell-hit-areas recipe does
// still works because getCellBounds returns rectangles, not squares.

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1', WILD = 'royal/royal_2';
const IDS = [A, B, C, SEVEN, WILD];

const COLS = 4, ROWS = 3;
const CELL_W = 70, CELL_H = 105;

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(6, 6)
  .symbols(r => {
    // `fit: true` preserves the sprite aspect ratio inside the non-square
    // cell instead of stretching — a must for real art.
    for (const id of IDS) {
      r.register(id, BlurSpriteSymbol, {
        textures, blurTextures,
        anchor: { x: 0.5, y: 0.5 },
        fit: true,
      });
    }
  })
  .weights({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 4, [WILD]: 3 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker).build();

// Draw a faint cell frame behind every cell so the non-square shape is
// obvious at a glance — this is purely for the demo; real games skip it.
const cellFrames = new PIXI.Graphics();
cellFrames.zIndex = -1;
reelSet.addChildAt(cellFrames, 0);
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const b = reelSet.getCellBounds(col, row);
    cellFrames
      .roundRect(b.x, b.y, b.width, b.height, 6)
      .fill({ color: 0xfaf6ef, alpha: 0.9 })
      .stroke({ color: 0xe5dccf, width: 1 });
  }
}

// Overlay for hover / picked outlines.
const overlayGfx = new PIXI.Graphics();
overlayGfx.zIndex = 9998;
reelSet.addChild(overlayGfx);

const picked = new Set();
let hoverKey = null;
const keyOf = (c, r) => c + ',' + r;
const parseKey = (k) => k.split(',').map(Number);

function redraw() {
  overlayGfx.clear();
  for (const k of picked) {
    const [col, row] = parseKey(k);
    const b = reelSet.getCellBounds(col, row);
    overlayGfx
      .roundRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4, 6)
      .stroke({ color: 0xff6b35, width: 3, alpha: 1 });
  }
  if (hoverKey && !picked.has(hoverKey)) {
    const [col, row] = parseKey(hoverKey);
    const b = reelSet.getCellBounds(col, row);
    overlayGfx
      .roundRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4, 6)
      .stroke({ color: 0x666666, width: 2, alpha: 0.55 });
  }
}

// One hit area per cell — getCellBounds returns the non-square rect;
// the Graphics picks it up transparently.
const hitAreas = [];
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const b = reelSet.getCellBounds(col, row);
    const hit = new PIXI.Graphics();
    hit.rect(b.x, b.y, b.width, b.height).fill({ color: 0xffffff, alpha: 0 });
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.zIndex = 9999;
    const k = keyOf(col, row);
    hit.on('pointerover', () => { hoverKey = k; redraw(); });
    hit.on('pointerout', () => { if (hoverKey === k) hoverKey = null; redraw(); });
    hit.on('pointertap', () => {
      if (picked.has(k)) picked.delete(k);
      else picked.add(k);
      redraw();
    });
    reelSet.addChild(hit);
    hitAreas.push(hit);
  }
}

reelSet.sortableChildren = true;

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => pickWeighted({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 4, [WILD]: 3 })));
    reelSet.setResult(grid);
    await p;
  },
  cleanup: () => {
    for (const h of hitAreas) h.destroy();
    overlayGfx.destroy();
    cellFrames.destroy();
  },
};
