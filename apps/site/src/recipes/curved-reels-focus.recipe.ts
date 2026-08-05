// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpriteSymbol, PIXI, app

// Where the camera stands.
//
// `.curve(...)` alone puts one camera dead ahead of every reel, so each is its
// own little drum and they all look identical. `.curveFocus('set')` puts a
// SINGLE camera in front of the middle of the board instead: cells that rotate
// away also lean IN toward the centre, and the whole grid reads as one wide
// cylinder rather than five separate ones.
//
// Watch the outer reels. Their top and bottom rows no longer just narrow in
// place, they tilt toward the middle of the board - and the centre reel, which
// the camera is pointed straight at, barely moves at all.
//
// `'set-lean'` is halfway between, and is usually the sweet spot on a 5-wide
// board with real art: enough of the one-big-drum read to sell the cabinet,
// not so much that the outer reels visibly tilt into their neighbours.
//
// Leaning cells cross their own column, so the builder auto-selects
// `SharedRectMaskStrategy`; the default per-reel mask would slice the overhang
// off at the boundary. Pass `.maskStrategy(...)` yourself to override.

const COLORS = [0xe8563f, 0xf2a03d, 0x3fa9e8, 0x5ac26a, 0x9b6bd6, 0xe0c341];
const SIZE = 128;

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
  .curve(0.5)
  .curveFocus('set') // <- one camera for the whole board
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
