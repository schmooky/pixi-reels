// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app, DebugPlaque
//
// A tall block that streams past DURING the spin, on one reel only.
//
// A big symbol one reel wide (`size: { reels: 1, cells: 3 }`) may carry a
// weight like any other symbol. The strip feed then streams it in whole,
// anchor and covered cells together, so a stacked wild or a 1x3 scatter
// can tease while the reel is still moving instead of only ever landing.
// Blocks wider than one reel still land only: the random fill feeds one
// reel at a time and cannot coordinate a 2x2 across two of them.
//
// The weight lives in a per-reel pool, so reel 0 is the only reel the block
// scrolls on. Same trick for the scatter on reel 4: weight 0 in the base
// table, re-raised on that one reel. (A pool `exclude` cannot be lifted
// again by a narrower layer; a weight of 0 can.)

const TALL = { id: 'tall', color: 0xffb86b, label: 'TALL', textColor: 0x6b3e0a, cells: 3 };
const SCATTER = { id: 'scatter', color: 0xff6b35, label: 'SCAT', textColor: 0xffffff };
const COLS = 5, ROWS = 3, SIZE = 84, GAP = 4;
const FILLER_IDS = CARD_DECK.map((c) => c.id);
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  // A block's anchor is its top cell. On a reel that travels down, the block
  // enters bottom first, so its covered cells arrive before the anchor that
  // draws them. With `start` buffer slots >= the block's cells those arrive
  // hidden above the window and the anchor is in place before any of it
  // shows. With the default 1, the top cell flickers blank for one wrap.
  // (A reel travelling up feeds anchor first and needs nothing.)
  .bufferSymbols({ start: TALL.cells, end: 1 })
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const card of CARD_DECK) {
      r.register(card.id, CardSymbol, { color: card.color, label: card.label, textColor: card.textColor });
    }
    r.register(TALL.id, CardSymbol, { color: TALL.color, label: TALL.label, textColor: TALL.textColor });
    r.register(SCATTER.id, CardSymbol, { color: SCATTER.color, label: SCATTER.label, textColor: SCATTER.textColor });
  })
  // The base table: cards everywhere, neither special symbol anywhere.
  .weights({ ...Object.fromEntries(FILLER_IDS.map((id) => [id, 10])), [SCATTER.id]: 0 })
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { reels: 1, cells: TALL.cells } } })
  // --- The two per-reel pools this recipe is about -----------------------
  // Reel 0: the tall block streams past, often.
  .randomSymbols({ weights: { [TALL.id]: 25 } }, { reel: 0 })
  // Reel 4: the only reel a scatter ever scrolls on.
  .randomSymbols({ weights: { [SCATTER.id]: 30 } }, { reel: 4 })
  // A block is big; the default landing bounce overshoots into the next cell.
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 1600, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

// --- Captions, one per reel ----------------------------------------------
const CAPTIONS = ['TALL x25', 'base', 'base', 'base', 'SCAT x30'];
const gridW = COLS * (SIZE + GAP) - GAP;
const title = new DebugPlaque({
  rows: [
    'a 1x3 block scrolls on reel 0, a scatter on reel 4, while they spin',
    { text: 'per-reel pools: weight 0 in the base table, raised on one reel', color: 0x94a3b8 },
  ],
  minWidth: gridW,
});
const PAD_TOP = title.plateHeight + 8;
const gridBottom = PAD_TOP + ROWS * (SIZE + GAP) - GAP;

const stage = new PIXI.Container();
reelSet.y = PAD_TOP;
stage.addChild(reelSet);
stage.addChild(title);
for (let i = 0; i < COLS; i++) {
  const scoped = CAPTIONS[i] !== 'base';
  const caption = new DebugPlaque({
    title: `reel ${i}`,
    rows: [{ text: CAPTIONS[i], color: scoped ? 0x16a34a : 0x94a3b8 }],
    fontSize: 9,
    padding: [4, 3],
    align: 'center',
    anchor: { x: 0.5, y: 0 },
    minWidth: SIZE,
  });
  caption.x = i * (SIZE + GAP) + SIZE / 2;
  caption.y = gridBottom + 8;
  stage.addChild(caption);
}

return {
  reelSet,
  stage,
  nextResult: () => {
    // What LANDS is still the server's call. Half the spins land the block
    // on reel 0 (anchored at cell 0, so it fills the column) and a scatter
    // on reel 4; the rest land plain cards, with the tease having been a tease.
    const grid = Array.from({ length: COLS }, () => [filler(), filler(), filler()]);
    if (Math.random() < 0.5) {
      grid[0] = [TALL.id, filler(), filler()];
      grid[4] = [filler(), SCATTER.id, filler()];
    }
    return grid;
  },
};
