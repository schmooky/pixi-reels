// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, DebugPlaque
//
// A tall block teased, landed peeking from the bottom, then EXPANDED up.
//
// Same tease and landing as the nudge-up demo: reel 4 crawls with 1x3
// blocks sliding past, and the result lands one with its head on the last
// visible cell and its body in bufferEnd. The difference is what happens
// next. A nudge moves the whole column; an expanding symbol grows over the
// cells above it while the rest of the column stays put, the way an
// expanding wild covers its reel.
//
// The engine side of that is one call: `setColumn(reel, column)` with the
// block anchored at cell 0 re-places the three cells at rest. The growth is
// the game's animation: the landed anchor is one sprite three cells tall
// with its body under the mask, so tweening its view up by two cells
// reveals it as if it grew, and `setColumn` then commits the same picture.

const TALL = { id: 'tall', color: 0xffb86b, label: 'TALL', textColor: 0x6b3e0a, cells: 3 };
const SCATTER = { id: 'scatter', color: 0xff6b35, label: 'SCAT', textColor: 0xffffff };
const COLS = 5, ROWS = 3, SIZE = 84, GAP = 4;
const TEASED = 4;
const FILLER_IDS = CARD_DECK.map((c) => c.id);
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const col3 = () => [filler(), filler(), filler()];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  .bufferSymbols({ start: TALL.cells, end: TALL.cells - 1 })
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const card of CARD_DECK) {
      r.register(card.id, CardSymbol, { color: card.color, label: card.label, textColor: card.textColor });
    }
    r.register(TALL.id, CardSymbol, { color: TALL.color, label: TALL.label, textColor: TALL.textColor });
    r.register(SCATTER.id, CardSymbol, { color: SCATTER.color, label: SCATTER.label, textColor: SCATTER.textColor });
  })
  .weights({ ...Object.fromEntries(FILLER_IDS.map((id) => [id, 10])), [SCATTER.id]: 0 })
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { reels: 1, cells: TALL.cells } } })
  .randomSymbols({ weights: { [TALL.id]: 20 } }, { reel: TEASED })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 2200, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const gridW = COLS * (SIZE + GAP) - GAP;
const title = new DebugPlaque({
  rows: [
    'scatters on reels 0 and 2, reel 4 crawls with 1x3 blocks sliding past',
    { text: 'the block lands peeking from the bottom, then grows up over the cells above', color: 0x94a3b8 },
  ],
  minWidth: gridW,
});
const stage = new PIXI.Container();
reelSet.y = title.plateHeight + 8;
stage.addChild(reelSet);
stage.addChild(title);

return {
  reelSet,
  stage,
  onSpin: async () => {
    // 1. Same landing as the nudge-up demo: head on the last visible cell.
    const grid = [col3(), col3(), col3(), col3(), [filler(), filler(), TALL.id]];
    grid[0][1] = SCATTER.id;
    grid[2][0] = SCATTER.id;
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    reelSet.setAnticipation([TEASED]);
    await p;
    await new Promise((r) => setTimeout(r, 700));

    // 2. Grow. The anchor on cell 2 is already the full block, clipped by
    //    the mask below the window, and it draws above the cards (zIndex 5).
    //    Slide its view up two cells and the block covers them as it rises.
    const reel = reelSet.reels[TEASED];
    const anchor = reel.getSymbolAt(ROWS - 1);
    const rise = (TALL.cells - 1) * (SIZE + GAP);
    await gsap.to(anchor.view, { y: anchor.view.y - rise, duration: 0.6, ease: 'power2.out' });

    // 3. Commit. The column now reads block-at-top; `setColumn` re-places
    //    the three cells to match, which lands the new anchor exactly where
    //    the tween left the old one. The body no longer hangs in bufferEnd,
    //    so those two slots get cards again.
    reelSet.setColumn(TEASED, {
      visible: [TALL.id, filler(), filler()],
      bufferEnd: [filler(), filler()],
    });
    await new Promise((r) => setTimeout(r, 900));
  },
};
