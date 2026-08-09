// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadSpineSet,
//           PIXI, app

// Bend the whole reel, not each symbol.
//
// `.curveMode('warp')` renders each reel to a texture and draws it through a
// mesh whose VERTICES are displaced by the projection. Everything inside bends
// - Spine skeletons, atlas sprites, text, effects - and no symbol has to
// cooperate or even know the reel is curved.
//
// These are Thunderkick's Rex the Hunt skeletons, which the per-symbol path
// cannot bend at all: a `Container` transform is affine, so it can only
// displace and scale a live skeleton. Here they curve like everything else,
// and they keep animating while they do.
//
// The other thing the warp buys you is MOTION. Because the bend is applied to
// the rendered reel rather than baked into each cell, anything that moves the
// strip travels along the curve for free - the spin, the stop bounce, cascade
// falls. On the per-symbol path the bounce is a flat translation of the reel
// container, so the whole board slides straight up and down instead of riding
// the drum.
//
// A bezel covers the top and bottom of the window. A drum whose middle cell is
// drawn 1:1 cannot also reach the window edges, so the buffer cells show there,
// compressed as they curve away - exactly the sliver of the next symbol a real
// cabinet shows, and exactly what a real cabinet's frame hides.

const { spineMap, symbolIds } = await loadSpineSet('thunderkick');
const IDS = [...symbolIds];

const REELS = 5;
const CELLS = 3;
// Rex the Hunt plates measure exactly 175x203 in the setup pose, and the
// skeleton draws at that size unless you tell it otherwise. Derive the cell
// from one scale factor and hand the SAME factor to the symbol - pick the cell
// without it and every skeleton overflows, cropping at the cell edge and
// spilling into its neighbours.
const SPINE_SCALE = 0.8;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;
// Gap on the CROSS axis only. It separates the drums, which is the point;
// a main-axis gap would punch black bands through each strip's background,
// because every symbol here carries its own full-bleed backdrop.
const GAP = 16;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(GAP, 0) // separates the drums without slicing the strips
  .bufferSymbols(2) // more to draw in the band the bezel covers
  .curve(0.45)
  .curveFocus('set-lean')
  .curveMode('warp') // <- bend the container, not the cells
  // Room across the strip for art wider than its cell. The mystery plate's
  // leaves overflow their tile; without this the warp texture slices them off
  // at the reel edge. `curveFocus` other than 'reel' has already selected
  // SharedRectMaskStrategy, so the overhang is not clipped again by the mask.
  .curveBleed(46)
  .renderer(app.renderer)
  // Per-symbol stacking INSIDE a reel. `zIndex` is folded in as
  // `zIndex * 100 + cellIndex`, so any raised value beats every cell index and
  // the symbol draws over its neighbours whatever row it lands on. The mystery
  // and scatter plates deliberately overflow their tile, so this is what lets
  // the leaves spill over the symbol below instead of being covered by it.
  // Re-applied on every wrap, so it holds mid-spin too.
  .symbolData({
    // Both overflow their tile, so both need to win against their neighbours.
    // Same tier rather than a pecking order: on a tie the cell index decides,
    // which keeps the lower cell in front and reads correctly either way.
    mystery: { zIndex: 2 },
    scatter: { zIndex: 2 },
  })
  // Weighted up from a real paytable so the demo actually shows them.
  .weights({
    ...Object.fromEntries(IDS.map((id) => [id, 6])),
    mystery: 14,
    scatter: 10,
  })
  .symbols((r) => {
    for (const id of IDS) {
      r.register(id, SpineReelSymbol, {
        spineMap,
        scale: SPINE_SCALE,
        autoPlayLanding: true,
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// --- bezel -------------------------------------------------------------
// Drawn OVER the set, in the set's own coordinates, so it travels with it.
const boardW = REELS * CELL_W + (REELS - 1) * GAP;
const boardH = CELLS * CELL_H;
// The drum's ends fall short of the window by `halfExtent * (1 - edgeMapped)`,
// about 45px at this size and curve. The bezel has to cover at least that or
// the curl shows under it.
const LIP = 50;

// Kept strictly INSIDE the board rect. A bezel drawn outside it grows the
// set's bounds, and the recipe runner centres on those - the board slides off
// centre and the frame stops lining up with the window.
const bezel = new PIXI.Graphics();
bezel
  .rect(0, 0, boardW, LIP)
  .rect(0, boardH - LIP, boardW, LIP)
  .fill({ color: 0x0b0a12 });
bezel
  .moveTo(0, LIP)
  .lineTo(boardW, LIP)
  .moveTo(0, boardH - LIP)
  .lineTo(boardW, boardH - LIP)
  .stroke({ color: 0x2c2740, width: 2 });
reelSet.addChild(bezel);

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => IDS[Math.floor(Math.random() * IDS.length)]),
    ),
};
