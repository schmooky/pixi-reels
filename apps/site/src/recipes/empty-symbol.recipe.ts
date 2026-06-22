// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, GoldCoinSymbol, Spine,
//                   SharedRectMaskStrategy, PIXI, gsap, app, EmptySymbol, pickWeighted

// EMPTY SYMBOL pattern.
//
// `EmptySymbol` is a {@link ReelSymbol} subclass that renders nothing
// and never animates. Register it against an id (here `'empty'`) to
// reserve a slot in the grid that produces NO visual output.
//
// Why this is useful (and why hold-and-win mechanics need it):
//   - Hold & Win bonuses spawn 1×1 "coin" pins on a grid that's
//     otherwise blank between respins. Real symbols would compete for
//     the player's attention with the pinned coins; an empty symbol
//     gets out of the way.
//   - Weighting an EMPTY id heavily (and a real symbol lightly) makes
//     valuable symbols feel rare and exciting. every coin landing on
//     an otherwise-blank board reads as a hit.
//   - Random fill still needs SOME id to put in each cell. EmptySymbol
//     is that id when "no symbol" is the desired visual.
//
// What this recipe runs:
//   - 3 reels, 3 visible rows. Symbol set is `{ coin, empty }`.
//   - The coin is the production Spine gold coin (GoldCoinSymbol).
//   - Weights `{ coin: 1, empty: 6 }`. most cells land blank; coins
//     scatter sparsely (~1 in 7 by weight).

const COIN = 'coin';
const EMPTY = 'empty';
const REELS = 3, ROWS = 3, CELL = 88, GAP = 6;

const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-jackpot': '/hw-spine/jackpot.json' };
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));
const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' } };
const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
probe.state.setAnimation(0, 'mini_x', true);
try { probe.update(0); } catch {}
const pb = probe.getLocalBounds();
const COIN_SCALE = (CELL - 8) / Math.max(1, pb.width, pb.height);
probe.destroy();

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(CELL, CELL)
  .symbolGap(GAP, GAP)
  // Spine content ignores the per-reel rect mask; the shared strategy plus
  // explicit empty buffers in every setResult keeps a scrolling coin clean.
  .maskStrategy(new SharedRectMaskStrategy())
  .symbols((registry) => {
    registry.register(COIN, GoldCoinSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle', scale: COIN_SCALE, settleSize: CELL - 10 });
    registry.register(EMPTY, EmptySymbol, {});
  })
  .weights({ [COIN]: 1, [EMPTY]: 6 })
  .initialFrame(Array.from({ length: REELS }, () => ({ visible: [EMPTY, EMPTY, EMPTY], bufferAbove: [EMPTY], bufferBelow: [EMPTY] })))
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const spin = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    // Coins scatter sparsely; buffers are forced empty so nothing spills.
    const grid = Array.from({ length: REELS }, () => ({
      visible: Array.from({ length: ROWS }, () => pickWeighted({ [COIN]: 1, [EMPTY]: 6 })),
      bufferAbove: [EMPTY],
      bufferBelow: [EMPTY],
    }));
    reelSet.setResult(grid);
    await spin;
  },
};
