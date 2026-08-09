// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpriteSymbol, PIXI, app

// The whole board on one drum. `.curve(0.5)` is the entire feature.
//
// `SpriteSymbol` draws its texture through a `PerspectiveMesh` as soon as the
// reel is curved, so every cell is a genuine projected TRAPEZOID: the edge that
// has rotated further round the drum is narrower than the one facing you. A
// scale can only ever hand you a smaller rectangle. This bends the art itself.
//
// The tiles are drawn with a grid on purpose - it is the quickest way to SEE a
// projection. On the top and bottom rows the grid lines converge toward the
// edge that has turned away; on the middle row, which faces the camera
// square-on, they stay parallel.
//
// It costs no render pass: the symbol already owns a texture, so the mesh maps
// that texture straight onto the projected quad. A set with no `.curve()` never
// allocates a mesh at all and runs exactly the code it ran before.

const COLORS = [0xe8563f, 0xf2a03d, 0x3fa9e8, 0x5ac26a, 0x9b6bd6, 0xe0c341];
const SIZE = 128;

// A flat tile with a border and an internal grid. Generated rather than loaded
// so the demo has no art dependency and the texture is exactly cell-shaped.
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
  .curve(0.5) // <- the whole thing
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
