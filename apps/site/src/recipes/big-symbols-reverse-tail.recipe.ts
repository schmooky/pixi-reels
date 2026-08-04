// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, app

// A tall block teased from the edge a ROLL-UP reel feeds from.
//
// Buffers are geometric, never travel-relative: `bufferStart` is always the
// slot above the visible window and `bufferEnd` always the slot below it, in
// both directions of travel. A `.direction('reverse')` reel feeds from the
// BOTTOM, so the half-landed tease lives in bufferEnd - the mirror of the
// vertical/forward "anchor in bufferStart" pattern.
//
// The block is anchored at the last visible cell with its body extending into
// bufferEnd, so only its head shows. Nudging 'forward' then drags it fully
// into view: nudge direction is relative to the reel's own axis, so on a
// reverse reel 'forward' travels UP.

const TALL = { id: 'tall', color: 0xff8c42, label: 'TALL', textColor: 0x4a1d00, reels: 1, cells: 3 };
const REELS = 5;
const CELLS = 3;
const SIZE = 78;
const GAP = 4;
const TARGET = 2; // the reel that gets the block
const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const ct = () => ({ visible: [filler(), filler(), filler()] });

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  // bufferEnd >= 2 so the 1x3 block can hang two cells below the window.
  .bufferSymbols(2)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .direction('reverse') // symbols rise from below and land at the top
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
  .weights(Object.fromEntries(FILLER_IDS.map((id) => [id, 1])))
  .symbolData({
    [TALL.id]: { weight: 0, zIndex: 5, size: { reels: TALL.reels, cells: TALL.cells } },
  })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // 1. Land the block with its anchor on the LAST visible cell. The engine
    //    paints OCCUPIED into bufferEnd[0] and bufferEnd[1] itself, so only
    //    the block's head shows, at the edge the reel feeds from.
    const grid = [ct(), ct(), { visible: [filler(), filler(), TALL.id] }, ct(), ct()];
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid);
    await p;
    await new Promise((r) => setTimeout(r, 700));

    // 2. Nudge 'forward' by 2: on a reverse reel that travels UP, so the
    //    anchor climbs from cell 2 to cell 0 and the block fills the window.
    //    Survival check (this reel feeds from the end edge): anchor strip
    //    index - distance >= 0, i.e. (bufferStart 2 + cell 2) - 2 = 2.
    //    `incoming` is always start-to-end (top-down) order; here every
    //    visible cell ends up owned by the block, so the pair is consumed by
    //    the wrap pipeline rather than shown. Pass real ids regardless.
    await reelSet.nudge(TARGET, {
      distance: 2,
      direction: 'forward',
      incoming: [filler(), filler()],
      duration: 640,
    });
    await new Promise((r) => setTimeout(r, 800));

    // 3. Nudge 'reverse' by 2 to push it back out of frame - downward, since
    //    it is this reel's against-travel direction.
    await reelSet.nudge(TARGET, {
      distance: 2,
      direction: 'reverse',
      incoming: [filler(), filler()],
      duration: 540,
    });
  },
};
