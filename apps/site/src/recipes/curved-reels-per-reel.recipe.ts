// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpriteSymbol, PIXI, app

// One wide drum instead of five identical ones.
//
// `.curvePerReel([...])` gives each reel its own camera. Bending the middle
// reels hardest and easing off toward the outside makes the board read as a
// single cylinder lying across the screen rather than five columns that each
// happen to be curved the same way. It is the cheapest trick in the file for
// making a 5x3 look like a cabinet.
//
// The array is one entry per reel and must match `reels()`. Each entry takes
// the same shorthand or object form `.curve()` does, so the outer reels here
// are nearly flat while the centre one runs deep - watch the grid lines
// converge harder as you look toward the middle of the board.
//
// `depth` is spelled out rather than left to default because the centre reel
// wants a stronger perspective than `amount * 0.5` would give it. It is capped
// below `cos(arc)` - past that the projection would fold cells back over each
// other - so a very deep curve quietly saturates instead of turning inside out.

const COLORS = [0xe8563f, 0xf2a03d, 0x3fa9e8, 0x5ac26a, 0x9b6bd6, 0xe0c341];
const SIZE = 128;

// Same generated grid tile as the single-curve recipe: a grid is the quickest
// way to SEE a projection, because parallel lines stop being parallel.
function tile(color) {
  const g = new PIXI.Graphics();
  g.roundRect(3, 3, SIZE - 6, SIZE - 6, 14).fill({ color });
  for (let i = 1; i < 4; i++) {
    const at = (SIZE / 4) * i;
    g.moveTo(at, 6).lineTo(at, SIZE - 6);
    g.moveTo(6, at).lineTo(SIZE - 6, at);
  }
  g.stroke({ color: 0xffffff, width: 2, alpha: 0.55 });
  g.roundRect(3, 3, SIZE - 6, SIZE - 6, 14).stroke({ color: 0xffffff, width: 4 });
  const texture = app.renderer.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return texture;
}

// NOT `textures`: that name is already an injected recipe global, and
// redeclaring it is a SyntaxError that shows up as a silently blank demo.
const art = {};
COLORS.forEach((color, i) => {
  art[`tile_${i}`] = tile(color);
});
const IDS = Object.keys(art);

const REELS = 5;
const CELLS = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(96, 96)
  .symbolGap(6, 6)
  .curvePerReel([
    { amount: 0.2, depth: 0.1 },
    { amount: 0.45, depth: 0.22 },
    { amount: 0.7, depth: 0.34 }, // centre reel faces you most
    { amount: 0.45, depth: 0.22 },
    { amount: 0.2, depth: 0.1 },
  ])
  .curveMode('warp') // bend the container: motion rides the curve too
  .renderer(app.renderer)
  .symbols((r) => {
    for (const id of IDS) r.register(id, SpriteSymbol, { textures: art });
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// --- bezel -------------------------------------------------------------
// A drum whose middle cell is drawn 1:1 cannot also reach the window edges;
// the buffer cells show in that band, compressed as they curve away. Real
// cabinets put a frame over it. `curve.mapMain(0)` is exactly where the drum's
// top edge lands, so the frame is measured, not guessed.
//
// Kept strictly INSIDE the window rect: a bezel drawn outside it grows the
// set's bounds and the recipe runner centres on those.
const bw = reelSet.viewport.maskWidth;
const bh = reelSet.viewport.maskHeight;
const lip = Math.ceil(Math.max(...reelSet.reels.map((r) => (r.curve ? r.curve.mapMain(0) : 0)))) + 2;
const bezel = new PIXI.Graphics();
bezel.rect(0, 0, bw, lip).rect(0, bh - lip, bw, lip).fill({ color: 0x0b0a12 });
bezel
  .moveTo(0, lip)
  .lineTo(bw, lip)
  .moveTo(0, bh - lip)
  .lineTo(bw, bh - lip)
  .stroke({ color: 0x2c2740, width: 2 });
reelSet.addChild(bezel);

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
