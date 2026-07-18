// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// CASCADE-FALL, 2x2 geometry.
//
// Same beat as the 1x3 canvas. a big symbol reveals itself when the
// cells supporting it clear. but the block is 2x2, so the anchor move
// spans TWO reels. `_coordinateBigSymbols` paints OCCUPIED stubs across
// the whole w*h footprint on both reels, from a single anchor cell.
//
// What this adds over the 1x3 canvas:
//   - Multi-reel blocks move through `nextGrid` exactly like single-reel
//     ones: reposition the ANCHOR, the coordinator re-paints the rest.
//   - The two covered reels animate their refill in the same phase, so
//     the block visually falls as one rigid piece.

const BIG = { id: 'big', color: 0x9a6cff, label: 'BIG', textColor: 0x2a0a4a, w: 2, h: 2 };
const REELS = 4;
const ROWS = 4;
const SIZE = 76;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  // Anchor starts at bufferAbove[0] (row -1) so half the block peeks in.
  .bufferSymbols(2)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, {
        color: card.color, label: card.label, textColor: card.textColor,
      });
    }
    registry.register(BIG.id, CardSymbol, {
      color: BIG.color, label: BIG.label, textColor: BIG.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [BIG.id]: { weight: 0, zIndex: 5, size: { w: BIG.w, h: BIG.h } } })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 320, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 480, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();

const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];

return {
  reelSet,
  onSpin: async () => {
    // ── 1. Initial spin: 2x2 block anchored on reel 1 at bufferAbove[0]
    //      (row -1). it spans rows -1..0 on reels 1-2, so only its
    //      bottom half peeks into the visible board. Plant a MATCH-row
    //      cluster at row 1 across all four reels.
    const MATCH = 'Q';
    const initialGrid = [
      { visible: [filler(), MATCH, filler(), filler()] },
      // Anchor at bufferAbove[0] = row -1. Footprint: reels 1-2,
      // rows -1..0. The coordinator paints the other three cells.
      {
        visible: [filler(), MATCH, filler(), filler()],
        bufferAbove: [BIG.id],
      },
      { visible: [filler(), MATCH, filler(), filler()] },
      { visible: [filler(), MATCH, filler(), filler()] },
    ];
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 240));
    reelSet.setResult(initialGrid);
    await spinDone;
    await new Promise((r) => setTimeout(r, 900));

    // ── 2. Cascade: the MATCH row clears, the block falls one row and
    //      lands fully visible at rows 0-1 of reels 1-2.
    let chained = false;
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: () => {
        if (chained) return [];
        chained = true;
        return [0, 1, 2, 3].map((reel) => ({ reel, row: 1 }));
      },
      nextGrid: () => [
        { visible: [filler(), filler(), filler(), filler()] },
        // Anchor now at visible[0]. block occupies rows 0-1 on reels
        // 1-2, fully visible. The coordinator paints OCCUPIED stubs at
        // the other three footprint cells.
        {
          visible: [BIG.id, filler(), filler(), filler()],
          bufferAbove: [filler()],
        },
        { visible: [filler(), filler(), filler(), filler()] },
        { visible: [filler(), filler(), filler(), filler()] },
      ],
      pauseAfterDestroyMs: 280,
    });
  },
};
