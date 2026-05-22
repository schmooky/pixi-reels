// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// CASCADE-FALL pattern.
//
// A tall 1x3 wild lands with its anchor in bufferAbove — tail visible
// at row 0. The other reels land a 3-of-a-kind cluster on a row BELOW
// the wild's tail. The cluster wins, the cells clear, and the cascade
// refill drops the wild downward into full visibility.
//
// This is the "big symbol falls when supporting cells are cleared"
// beat — common in cluster / tumble slots where high-value symbols
// reveal themselves over multiple cascade chains.
//
// What this proves:
//   - `runCascade`'s `nextGrid` callback can return a grid that
//     repositions a big-symbol anchor — moving it from bufferAbove[1]
//     (row -2) to visible[0] (row 0) in one cascade step.
//   - `_coordinateBigSymbols` runs on the refill grid the same as on
//     a setResult grid — buffer-row anchors are accepted, OCCUPIED
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
  .visibleSymbols(ROWS)
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
    //      plant a MATCH cluster across all 3 reels at row 1.
    const initialGrid = [
      // Reel 0: anchor at bufferAbove[1] = row -2. Block spans rows
      // -2, -1, 0. Tail at visible[0]. Plant MATCH at row 1; fillers
      // at rows 2, 3.
      {
        visible: [filler(), MATCH.id, filler(), filler()],
        bufferAbove: [undefined, TALL.id],
      },
      // Reel 1: MATCH at row 1.
      { visible: [filler(), MATCH.id, filler(), filler()] },
      // Reel 2: MATCH at row 1.
      { visible: [filler(), MATCH.id, filler(), filler()] },
    ];
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 240));
    reelSet.setResult(initialGrid);
    await spinDone;
    await new Promise((r) => setTimeout(r, 900));

    // ── 2. Cascade: MATCH row clears, wild falls. ─────────────────────
    //
    // `runCascade` runs `detectWinners` → `destroySymbols` → `nextGrid`
    // → refill, repeating until detectWinners returns []. We script a
    // single round here: row 1 across all 3 reels is the winning
    // cluster, and nextGrid moves the wild block to visible[0..2].
    let chained = false;
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: () => {
        if (chained) return [];
        chained = true;
        return [0, 1, 2].map((reel) => ({ reel, row: 1 }));
      },
      nextGrid: () => [
        // Reel 0: block now at rows 0, 1, 2 (fully visible). New top
        // cell in bufferAbove[0]; the coordinator paints OCCUPIED at
        // visible[1] and [2] so 'tall' here is the anchor only.
        {
          visible: [TALL.id, filler(), filler(), filler()],
          bufferAbove: [filler()],
        },
        // Reels 1, 2: fresh random fillers.
        { visible: [filler(), filler(), filler(), filler()] },
        { visible: [filler(), filler(), filler(), filler()] },
      ],
      pauseAfterDestroyMs: 280,
    });
  },
};
