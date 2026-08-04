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
  .symbols((r) => {
    for (const id of IDS) r.register(id, SpriteSymbol, { textures: art });
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
