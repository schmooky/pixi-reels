// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol,
//           loadHoldAndWinSprites, app

// Real art on the drum.
//
// The grid tiles in the other recipes are a measuring instrument - they make
// the projection obvious. This is what it looks like on shipped symbols:
// Playson's Supercharged Diamonds 3 gem set, the same sheet the sprite Hold &
// Win recipes use.
//
// Two things matter here that the grid tiles hide.
//
// 1. These gems do NOT fill their cells. They are trimmed atlas frames,
//    letterboxed into a square cell, so the actual art is a shape floating in
//    a much bigger transparent box. `BlurSpriteSymbol` reports where its art
//    really sits via `cellInset`, so the drum projects THE GEM rather than the
//    empty cell around it - otherwise every symbol would be inflated to the
//    cell edges and handed the cell's keystone instead of its own.
//
// 2. `BlurSpriteSymbol` is a docs-site class, not a library one, and it opts
//    into the real projection in about ten lines by handing the quad to the
//    exported `PerspectiveCell`. That is the whole extension story: if your
//    symbol's content is a single texture, you get true keystoning; if it is a
//    Spine skeleton or a composite subtree, the base class falls back to a
//    uniform scale and nothing is distorted.
//
// Blur-on-spin still works: the mesh is handed each new texture as the symbol
// swaps to its motion-blur variant.

const { symbols, blur } = await loadHoldAndWinSprites();

const IDS = ['1', '2', '3', '4', '5', '6', '7', '8', 'wild'];

class BlurCell extends BlurSpriteSymbol {
  onReelSpinStart() { this.setBlurred(true); }
  onReelSpinEnd() { this.setBlurred(false); }
  onReelLanded() { this.setBlurred(false); }
}

const REELS = 5;
const CELLS = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(96, 96)
  .symbolGap(6, 6)
  .curve({ amount: 0.6, depth: 0.55 })
  .curveFocus('set-lean')
  .curveMode('warp') // bend the container: motion rides the curve too
  .renderer(app.renderer)
  .symbols((r) => {
    for (const id of IDS) {
      r.register(id, BlurCell, { textures: symbols, blurTextures: blur });
    }
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
