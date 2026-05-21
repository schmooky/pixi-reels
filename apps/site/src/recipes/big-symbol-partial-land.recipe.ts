// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// PARTIAL-LAND pattern.
//
// A tall 1x3 wild lands with its ANCHOR in bufferAbove — most of the
// block is hidden above the visible window, only its bottom cell shows
// at row 0 ("tail visible"). The player nudges DOWN by 2 to drag the
// whole block into view, then nudges UP by 2 to push it back into
// hiding. The classic "the big symbol is peeking — nudge to reveal"
// fruit-machine beat.
//
// This is enabled by:
//   - `_coordinateBigSymbols` scans the full strip range (including
//     bufferAbove and bufferBelow) for big-symbol anchors. The user
//     supplies the anchor at `bufferAbove[1]`; the engine paints
//     OCCUPIED at `bufferAbove[0]` and `visible[0]` automatically.
//   - `_finalizeFrame` sizes anchors that sit in bufferAbove with the
//     block's body extending into visible. The mask clips the off-screen
//     portion; the visible portion of the sprite shows through.
//   - `getVisibleSymbols` resolves visible row 0 to the anchor's id via
//     a NEGATIVE `anchorRow` in `_occupancy`.

const TALL = { id: 'tall', color: 0xff8c42, label: 'TALL', textColor: 0x4a1d00, w: 1, h: 3 };
const REELS = 5;
const ROWS = 3;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleSymbols(ROWS)
  // Need bufferAbove >= 2 so the 1x3 block's anchor can sit at row -2
  // with the block extending through row 0.
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
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { w: TALL.w, h: TALL.h } } })
  // Big symbols don't tolerate the default landing bounce — zero it.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const ct = () => ({ visible: [filler(), filler(), filler()] });

return {
  reelSet,
  onSpin: async () => {
    // 1. Land the 1x3 TALL with anchor at `bufferAbove[1]` (= row -2).
    //    Block spans rows -2, -1, 0. Only visible row 0 shows the block's
    //    bottom cell; rows 1 and 2 are random fillers.
    //
    //    The engine paints OCCUPIED at row -1 and row 0 automatically;
    //    we leave `bufferAbove[0]` undefined and `visible[0]` as filler
    //    (both get overwritten by the coordinator).
    //
    //    NOTE: `setResult` requires every column to use the same input
    //    shape (string[] OR ColumnTarget — never mixed). The other reels
    //    are also ColumnTargets even though they don't need buffer entries.
    const grid = [
      ct(), ct(),
      { visible: [filler(), filler(), filler()], bufferAbove: [undefined, TALL.id] },
      ct(), ct(),
    ];
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid);
    await p;
    await new Promise((r) => setTimeout(r, 700));

    // 2. Nudge DOWN by 2 — anchor moves from row -2 to row 0; block now
    //    fills visible rows 0, 1, 2. Fully visible.
    //
    //    Survival check (down): anchor strip index + h - 1 + distance < total
    //    (0 + 3 - 1 + 2 = 4 < 7) — total = bufferAbove(2) + visibleRows(3) +
    //    bufferBelow(2). The block stays on the strip end-to-end.
    //
    //    `incoming` is the new visible-area content arriving from the top.
    //    Buffer slots and big-symbol cells (anchor / OCCUPIED stubs) are
    //    protected during pre-placement, so any incoming entries that would
    //    land on a protected slot are dropped. Here every visible row is
    //    consumed by the block, so the incoming pair is consumed by the
    //    wrap pipeline (queue → random buffer fill) rather than appearing
    //    on screen. Pass real ids regardless; the engine ignores unused ones.
    await reelSet.nudge(2, {
      distance: 2,
      direction: 'down',
      incoming: [filler(), filler()],
      duration: 640,
    });
    await new Promise((r) => setTimeout(r, 800));

    // 3. Nudge UP by 2 — anchor moves back from row 0 to row -2.
    //    Survival check (up): anchor strip index - distance >= 0 (2 - 2 = 0).
    //    Block returns to tail-visible state.
    await reelSet.nudge(2, {
      distance: 2,
      direction: 'up',
      incoming: [filler(), filler()],
      duration: 540,
    });
  },
};
