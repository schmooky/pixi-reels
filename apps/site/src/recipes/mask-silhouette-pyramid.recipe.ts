// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SilhouetteMaskStrategy,
//                   CardSymbol, CARD_DECK, PIXI, app
//
// ROUNDING A JAGGED BOARD.
//
// A pyramid (3-4-5-4-3) has no single rectangle to round. The two obvious
// approaches both fail:
//
//   - Round each reel box -> every shared seam gets notched, because both
//     sides of the same edge curve away from each other.
//   - Round the bounding box -> the staircase disappears and buffer cells show
//     past the ends of the short reels.
//
// `SilhouetteMaskStrategy` walks the rectilinear UNION OUTLINE of the reel
// rects and rounds every vertex of it. The outer corners bulge out; the inward
// corners where a short reel meets a tall one curve the other way, and take
// their own (usually smaller) `concaveRadius` - the step they sit on is much
// shorter than the outer edges, so one radius for both reads badly.
//
// Reels must butt together (cross gap 0). With a gap the reels are genuinely
// disjoint, their union is several rings rather than one, and the strategy says
// so once and falls back to per-reel rounded rects.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SHAPE = [3, 4, 5, 4, 3];
const REELS = SHAPE.length, SIZE = 76, GAP = 0;
const RADIUS = 26, CONCAVE = 9;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCellsPerReel(SHAPE)
  .symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .maskStrategy(new SilhouetteMaskStrategy({ radius: RADIUS, concaveRadius: CONCAVE }))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 130 })
  .ticker(app.ticker)
  .build();

const TALLEST = Math.max(...SHAPE);
const H = TALLEST * SIZE;

const hud = new PIXI.Text({
  text: `SilhouetteMaskStrategy({ radius: ${RADIUS}, concaveRadius: ${CONCAVE} }) on ${SHAPE.join('-')}`,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    const grid = SHAPE.map((cells) => ({
      visible: Array.from({ length: cells }, rv),
    }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 380));
    reelSet.setResult(grid);
    await p;
  },
};
