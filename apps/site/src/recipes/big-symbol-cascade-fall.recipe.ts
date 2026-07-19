// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// CASCADE-FALL pattern.
//
// A tall 1x3 wild lands with its anchor in bufferAbove. tail visible
// at row 0. All three reels land a TWO-ROW cluster below the wild's
// tail (rows 1 and 2). The cluster wins, six cells clear, and the
// cascade refill drops the wild TWO rows into full visibility.
//
// Physics note (ADR-010): the anchor moves from row -2 to row 0, a
// two-cell fall. so exactly TWO winner rows must sit below it. With a
// single cleared row the engine's drop geometry starts the block one
// cell above its slot while its old view sat two cells up: a visible
// snap. Two winners below = start position matches the old view's
// pixel exactly, and the fall is seamless.
//
// This is the "big symbol falls when supporting cells are cleared"
// beat. common in cluster / tumble slots where high-value symbols
// reveal themselves over multiple cascade chains.
//
// What this proves:
//   - `runCascade`'s `nextGrid` callback can return a grid that
//     repositions a big-symbol anchor. moving it from bufferAbove[1]
//     (row -2) to visible[0] (row 0) in one cascade step.
//   - `_coordinateBigSymbols` runs on the refill grid the same as on
//     a setResult grid. buffer-row anchors are accepted, OCCUPIED
//     stubs painted across the moved block's new position.
//   - The visual block "falls" because the refill animation drops
//     each strip cell, including the anchor sprite, into its new slot.

const TALL = { id: 'tall', color: 0xff8c42, label: 'TALL', textColor: 0x4a1d00, w: 1, h: 3 };
const MATCH = { id: 'match', color: 0x4ade80, label: 'MATCH', textColor: 0x0a4a1d };
const REELS = 3;
const ROWS = 4;
const SIZE = 76;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  // Anchor at bufferAbove[1] (row -2) needs bufferAbove >= 2.
  .bufferSymbols(2)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, {
        color: card.color, label: card.label, textColor: card.textColor,
      });
    }
    registry.register(TALL.id, CardSymbol, {
      color: TALL.color, label: TALL.label, textColor: TALL.textColor,
    });
    registry.register(MATCH.id, CardSymbol, {
      color: MATCH.color, label: MATCH.label, textColor: MATCH.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { w: TALL.w, h: TALL.h } } })
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
    // ── 1. Initial spin: tall wild on reel 0 with tail at row 0; ─────
    //      plant a two-row MATCH cluster across all 3 reels (rows 1-2).
    const initialGrid = [
      // Reel 0: anchor at bufferAbove[1] = row -2. Block spans rows
      // -2, -1, 0. Tail at visible[0]. Plant MATCH at row 1; fillers
      // at rows 2, 3.
      {
        visible: [filler(), MATCH.id, MATCH.id, filler()],
        bufferAbove: [undefined, TALL.id],
      },
      // Reel 1: MATCH at rows 1-2.
      { visible: [filler(), MATCH.id, MATCH.id, filler()] },
      // Reel 2: MATCH at rows 1-2.
      { visible: [filler(), MATCH.id, MATCH.id, filler()] },
    ];
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 240));
    reelSet.setResult(initialGrid);
    await spinDone;
    await new Promise((r) => setTimeout(r, 900));

    // ── 2. Cascade: both MATCH rows clear, wild falls two cells. ──────
    //
    // `runCascade` runs `detectWinners` → `destroySymbols` → `nextGrid`
    // → refill, repeating until detectWinners returns []. We script a
    // single round here: rows 1 AND 2 across all 3 reels are the winning
    // cluster (two winners below the block = two-cell fall), and
    // nextGrid moves the wild block to visible[0..2].
    let chained = false;
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: () => {
        if (chained) return [];
        chained = true;
        return [0, 1, 2].flatMap((reel) => [{ reel, row: 1 }, { reel, row: 2 }]);
      },
      // Survivors KEEP their identities (the "semantic winners" rule from
      // the destroy recipe): rows not in the winner set are read from
      // `prev` and packed to the bottom. only the cleared cells get fresh
      // symbols. Handing every reel a fresh random column would swap the
      // bottom row's face in place. it has no hole below it, so it never
      // animates, and the identity swap is a visible pop.
      nextGrid: (prev) => [
        // Reel 0: block now at rows 0, 1, 2 (fully visible). New top
        // cell in bufferAbove[0]; the coordinator paints OCCUPIED at
        // visible[1] and [2] so 'tall' here is the anchor only. Row 3
        // is the untouched survivor. same face as before the cascade.
        {
          visible: [TALL.id, filler(), filler(), prev[0][3]],
          bufferAbove: [filler()],
        },
        // Reels 1, 2: two fresh symbols on top, survivors (old rows 0
        // and 3) packed to the bottom in their original order.
        { visible: [filler(), filler(), prev[1][0], prev[1][3]] },
        { visible: [filler(), filler(), prev[2][0], prev[2][3]] },
      ],
      pauseAfterDestroyMs: 280,
    });
  },
};
