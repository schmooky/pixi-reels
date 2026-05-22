// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// NUDGE THROUGH A BIG SYMBOL.
//
// Demonstrates that a 1xH block on the target reel is nudged as a unit
// when the rotation preserves the block. Sequence:
//
//   1. Land with a 1x2 "MEGA" wild at rows 0+1 (anchor at row 0).
//   2. Nudge DOWN by 2 — anchor moves to row 2, stub spills into
//      bufferBelow. Only the TOP half of the block is visible.
//   3. Nudge UP by 1 — block snaps back into full visibility at rows 1+2.
//
// Survival check (down direction): anchorRow + h - 1 + distance < total.
// For the down-by-2 step: 1 + 2 - 1 + 2 = 4 < 5 (with bufferAbove=1,
// visibleRows=3, bufferBelow=1, total=5) — block fits.
//
// Cross-reel blocks (w > 1) throw; that case is intentionally excluded.

const MEGA = { id: 'mega', color: 0xff8c42, label: 'MEGA', textColor: 0x4a1d00, w: 1, h: 2 };
const REELS = 5;
const ROWS = 3;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, {
        color: card.color, label: card.label, textColor: card.textColor,
      });
    }
    registry.register(MEGA.id, CardSymbol, {
      color: MEGA.color, label: MEGA.label, textColor: MEGA.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({
    [MEGA.id]: { weight: 0, zIndex: 5, size: { w: MEGA.w, h: MEGA.h } },
  })
  // Big symbols don't tolerate the default 56px landing bounce — zero it
  // so the anchor lands flush on grid.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const col3 = () => [filler(), filler(), filler()];

return {
  reelSet,
  onSpin: async () => {
    // 1. Land a 1x2 MEGA wild at column 2, rows 0+1. The OCCUPIED stub
    //    at row 1 is placed by the big-symbol coordinator inside setResult.
    const grid = [col3(), col3(), [MEGA.id, MEGA.id, filler()], col3(), col3()];
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 500));

    // 2. Nudge column 2 DOWN by 2. Survival: 1 + 2 - 1 + 2 = 4 < 5 ✓.
    //    After: anchor at row 2, stub at bufferBelow → only top half of
    //    the block is visible.
    await reelSet.nudge(2, {
      distance: 2,
      direction: 'down',
      incoming: [filler(), filler()],
      duration: 600,
    });
    await new Promise((r) => setTimeout(r, 700));

    // 3. Nudge UP by 1 to bring the full block back into view at rows 1+2.
    //    Survival up: anchorRow (3) >= distance (1) ✓.
    await reelSet.nudge(2, {
      distance: 1,
      direction: 'up',
      incoming: [filler()],
      duration: 480,
    });
  },
};
