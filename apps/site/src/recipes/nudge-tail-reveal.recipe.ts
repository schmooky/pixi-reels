// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, app

// TAIL-REVEAL pattern.
//
// Big symbol lands fully visible. We nudge it UP by 1 so the anchor
// crosses into bufferAbove. only the bottom cell of the block
// remains in the visible window ("tail visible"). The engine's
// `_finalizeFrame` sizes the anchor to span the whole block even
// though it lives above visible, so the visible portion renders as
// the bottom of the sprite, masked at the top edge.
//
// A beat later we nudge DOWN by 1 to bring the full block back into
// view. The classic "the player sees the tail of the wild peeking in,
// then nudges to reveal it fully" UX.

const MEGA = { id: 'mega', color: 0xff8c42, label: 'MEGA', textColor: 0x4a1d00, w: 1, h: 2 };
const REELS = 5;
const ROWS = 3;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
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
  .symbolData({ [MEGA.id]: { weight: 0, zIndex: 5, size: { w: MEGA.w, h: MEGA.h } } })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const col3 = () => [filler(), filler(), filler()];

return {
  reelSet,
  onSpin: async () => {
    // 1. Land 1x2 MEGA anchored at column 2, row 0. Block fills rows 0+1.
    const grid = [col3(), col3(), [MEGA.id, MEGA.id, filler()], col3(), col3()];
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 500));

    // 2. Nudge UP by 1. anchor at strip[1] → strip[0] (bufferAbove).
    //    Stub follows: strip[2] → strip[1] (visible row 0).
    //    Block is now "tail visible": top in bufferAbove (clipped), bottom
    //    showing at row 0. `_finalizeFrame` sizes the anchor sprite to the
    //    full block height; the mask clips the half above visible.
    await reelSet.nudge(2, {
      distance: 1,
      direction: 'up',
      incoming: [filler()],
      duration: 540,
    });
    await new Promise((r) => setTimeout(r, 800));

    // 3. Nudge DOWN by 1 to fully reveal the block at rows 0+1 again.
    //    The classic "nudge to reveal the wild" beat.
    await reelSet.nudge(2, {
      distance: 1,
      direction: 'down',
      incoming: [filler()],
      duration: 540,
    });
  },
};
