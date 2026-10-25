// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app, DebugPlaque
//
// A tall block teased, landed peeking from the bottom, then nudged up.
//
// Two scatters land on reels 0 and 2, so reel 4 goes into an anticipation
// crawl. The 1x3 block has a weight on reel 4 only, and the random feed
// keeps drawing it while the reel crawls, so the tease shows block after
// block sliding slowly past. The result then lands the block with its head
// on the last visible cell and its body in bufferEnd. After a beat a
// 'reverse' nudge (up, on a reel that travels down) brings the whole
// column up two cells and the block into full view.
//
// Buffers: `start: 3` hides a block's covered cells while its anchor is off
// the strip (the builder requires it for a weighted tall block), `end: 2`
// holds the body of the block that lands peeking.

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
  // The teased reel is the only one that streams the block.
  .randomSymbols({ weights: { [TALL.id]: 20 } }, { reel: TEASED })
  // A long hold, so the crawl with blocks sliding past is easy to watch.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 2200, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const gridW = COLS * (SIZE + GAP) - GAP;
const title = new DebugPlaque({
  rows: [
    'scatters on reels 0 and 2, reel 4 crawls with 1x3 blocks sliding past',
    { text: 'the block lands peeking from the bottom, then nudges up', color: 0x94a3b8 },
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
    // 1. Spin, then land two scatters and the block's head on the last
    //    visible cell of reel 4. The coordinator paints the body into
    //    bufferEnd; the tease on reel 4 shows more blocks on the way.
    const grid = [col3(), col3(), col3(), col3(), [filler(), filler(), TALL.id]];
    grid[0][1] = SCATTER.id;
    grid[2][0] = SCATTER.id;
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    reelSet.setAnticipation([TEASED]);
    await p;
    await new Promise((r) => setTimeout(r, 700));

    // 2. Nudge the column up by two. On a reel that travels down,
    //    'reverse' is up. Survival: the anchor's strip index (3 + 2 = 5)
    //    minus the distance stays on the strip, and the two cells above it
    //    scroll out through the top. `incoming` is start-to-end order.
    await reelSet.nudge(TEASED, {
      distance: TALL.cells - 1,
      direction: 'reverse',
      incoming: [filler(), filler()],
      duration: 640,
    });
    await new Promise((r) => setTimeout(r, 900));
  },
};
