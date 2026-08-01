// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// PARTIAL-LAND pattern.
//
// A tall 1x3 wild lands with its ANCHOR in bufferStart. most of the
// block is hidden above the visible window, only its bottom cell shows
// at cell 0 ("tail visible"). The player nudges DOWN by 2 to drag the
// whole block into view, then nudges UP by 2 to push it back into
// hiding.
//
// This is enabled by:
//   - `_coordinateBigSymbols` scans the full strip range (including
//     bufferStart and bufferEnd) for big-symbol anchors. The user
//     supplies the anchor at `bufferStart[1]`; the engine paints
//     OCCUPIED at `bufferStart[0]` and `visible[0]` automatically.
//   - `_finalizeFrame` sizes anchors that sit in bufferStart with the
//     block's body extending into visible. The mask clips the off-screen
//     portion; the visible portion of the sprite shows through.
//   - `getVisibleSymbols` resolves visible cell 0 to the anchor's id via
//     a NEGATIVE `anchorCell` in `_occupancy`.

const TALL = { id: 'tall', color: 0xff8c42, label: 'TALL', textColor: 0x4a1d00, w: 1, h: 3 };
const REELS = 5;
const ROWS = 3;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(ROWS)
  // Need bufferStart >= 2 so the 1x3 block's anchor can sit at cell -2
  // with the block extending through cell 0.
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
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { reels: TALL.w, cells: TALL.h } } })
  // Big symbols don't tolerate the default landing bounce. zero it.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const ct = () => ({ visible: [filler(), filler(), filler()] });

return {
  reelSet,
  onSpin: async () => {
    // 1. Land the 1x3 TALL with anchor at `bufferStart[1]` (= cell -2).
    //    Block spans cells -2, -1, 0. Only visible cell 0 shows the block's
    //    bottom cell; cells 1 and 2 are random fillers.
    //
    //    The engine paints OCCUPIED at cell -1 and cell 0 automatically;
    //    we leave `bufferStart[0]` undefined and `visible[0]` as filler
    //    (both get overwritten by the coordinator).
    //
    //    Every column is a ColumnTarget; reels that do not need buffer
    //    entries pass `{ visible: [...] }` alone.
    const grid = [
      ct(), ct(),
      { visible: [filler(), filler(), filler()], bufferStart: [undefined, TALL.id] },
      ct(), ct(),
    ];
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid);
    await p;
    await new Promise((r) => setTimeout(r, 700));

    // 2. Nudge DOWN by 2. anchor moves from cell -2 to cell 0; block now
    //    fills visible cells 0, 1, 2. Fully visible.
    //
    //    Survival check (down): anchor strip index + h - 1 + distance < total
    //    (0 + 3 - 1 + 2 = 4 < 7). total = bufferStart(2) + visibleCells(3) +
    //    bufferEnd(2). The block stays on the strip end-to-end.
    //
    //    `incoming` is the new visible-area content arriving from the top.
    //    Buffer slots and big-symbol cells (anchor / OCCUPIED stubs) are
    //    protected during pre-placement, so any incoming entries that would
    //    land on a protected slot are dropped. Here every visible cell is
    //    consumed by the block, so the incoming pair is consumed by the
    //    wrap pipeline (queue → random buffer fill) rather than appearing
    //    on screen. Pass real ids regardless; the engine ignores unused ones.
    await reelSet.nudge(2, {
      distance: 2,
      direction: 'forward',
      incoming: [filler(), filler()],
      duration: 640,
    });
    await new Promise((r) => setTimeout(r, 800));

    // 3. Nudge UP by 2. anchor moves back from cell 0 to cell -2.
    //    Survival check (up): anchor strip index - distance >= 0 (2 - 2 = 0).
    //    Block returns to tail-visible state.
    await reelSet.nudge(2, {
      distance: 2,
      direction: 'reverse',
      incoming: [filler(), filler()],
      duration: 540,
    });
  },
};
