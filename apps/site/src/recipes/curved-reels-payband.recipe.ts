// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpriteSymbol, PIXI, app

// A tall drum with a 3x5 pay band inside it.
//
// The window shows FIVE cells; only the middle three pay. The top and bottom
// rows are there to be curved: they are the part of the drum turning away from
// you, and on a real cabinet they are what tells your eye it is a cylinder and
// not a grid. They still land real symbols - the strip does not know they are
// decorative - the game simply evaluates rows 1-3.
//
// This is a better shape for a curve than a bare 3x5. With only three rows the
// drum has to bend hard to read as round, which distorts the paying symbols;
// with five, the bend is spent on rows nobody is trying to read, and the pay
// band sits near the middle where the projection is close to 1:1.
//
// The scrim over the non-paying rows is drawn from `getCellQuad()`, not
// `getCellBounds()`. Bounds return a rectangle - the trapezoid's bounding box -
// which on a curved reel is visibly looser than the cell, so a scrim built from
// it would spill over its neighbours. The quad is the four corners the cell is
// really drawn on, so the dimming sits ON the curve.

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

// NOT `textures`: that name is already an injected recipe global.
const art = {};
COLORS.forEach((color, i) => {
  art[`tile_${i}`] = tile(color);
});
const IDS = Object.keys(art);

const REELS = 5;
const CELLS = 5; // five drawn...
const PAY_FROM = 1; // ...three of them paying
const PAY_TO = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(96, 96)
  .symbolGap(6, 6)
  // Deeper than a 3-row board would take, precisely because the extra rows
  // absorb it: the pay band stays near 1:1 while the ends curl away.
  .curve(0.62)
  .curveFocus('set-lean')
  .curveMode('warp')
  .renderer(app.renderer)
  .symbols((r) => {
    for (const id of IDS) r.register(id, SpriteSymbol, { textures: art });
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// --- pay band ----------------------------------------------------------
// Scrim over the non-paying rows, outline around the paying ones. Both are
// built from the projected quads, so they follow the drum exactly.
const band = new PIXI.Graphics();

function drawBand() {
  band.clear();
  for (let reel = 0; reel < REELS; reel++) {
    for (let cell = 0; cell < CELLS; cell++) {
      const quad = reelSet.getCellQuad(reel, cell) ?? null;
      if (!quad) continue;
      if (cell < PAY_FROM || cell > PAY_TO) {
        // Non-paying: dim it rather than hide it. It is still a real landed
        // symbol, just not one the game reads.
        band.poly(quad).fill({ color: 0x05040a, alpha: 0.55 });
      }
    }
  }
  // Bezel over the band the drum's ends leave short, same as the other
  // curvature recipes: `mapMain(0)` is exactly where the drum's top edge lands.
  const bw = reelSet.viewport.maskWidth;
  const bh = reelSet.viewport.maskHeight;
  const lip = Math.ceil(Math.max(...reelSet.reels.map((r) => (r.curve ? r.curve.mapMain(0) : 0)))) + 2;
  band.rect(0, 0, bw, lip).rect(0, bh - lip, bw, lip).fill({ color: 0x05040a });
}

drawBand();
reelSet.addChild(band);

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
