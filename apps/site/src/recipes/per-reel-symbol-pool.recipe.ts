// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, app, DebugPlaque
//
// Give one reel its own draw table.
//
// `builder.weights({...})` is one table for the whole set. A pool scoped to
// `{ reel: n }` layers on top of it for that reel alone, so the strip
// streaming past reel 2 can be nothing but wilds while its neighbours keep
// the base mix -- no middleware, no second ReelSet.
//
// Watch the spin, not the landing: pools decide what SCROLLS past. What
// stops on screen is whatever `setResult` says, exactly as before.

const WILD = WILD_CARD.id;
const LOW = ['7', '8'];
const HIGH = ['J', 'Q', 'K', 'A'];

const COLS = 5, ROWS = 3, SIZE = 84, GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  // The base table every reel starts from: low cards common, wild rare.
  .weights({ '7': 20, '8': 20, '9': 14, '10': 14, J: 8, Q: 8, K: 6, A: 6, [WILD]: 2 })
  // --- The three pools this recipe is about ---------------------------
  // Build-time form. `reelSet.randomSymbols.set(pool, scope)` takes the same
  // pool and scope at run time, which is where a feature-mode swap belongs.
  //
  // Reel 0: low cards only. Weight 0 bans a symbol as surely as `exclude`.
  .randomSymbols({ weights: { '9': 0, '10': 0, J: 0, Q: 0, K: 0, A: 0, [WILD]: 0 } }, { reel: 0 })
  // Reel 2: a wild reel while it spins.
  .randomSymbols({ weights: { [WILD]: 400 } }, { reel: 2 })
  // Reel 4: never teases a wild at all.
  .randomSymbols({ exclude: [WILD] }, { reel: 4 })
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 1400, stopDelay: 220 })
  .ticker(app.ticker)
  .build();

// --- Captions, so the rule under each reel is readable -----------------
// One composition root with headroom for the title, returned as `stage`: the
// runner scales and centres that instead of clipping what sits above y = 0.
const CAPTIONS = ['low cards only', 'base table', 'WILD x400', 'base table', 'no WILD'];
const gridW = COLS * (SIZE + GAP) - GAP;

// The engine only reports what it will draw; assert your own config with it.
// The second row is reel 2's table as the engine resolved it: the base mix
// with the pool's wild weight on top.
const reel2 = reelSet.randomSymbols.weights({ reel: 2 });
const title = new DebugPlaque({
  rows: [
    'one weights() table, three per-reel pools on top',
    {
      text: `reel 2 draws: ${Object.entries(reel2).map(([id, w]) => `${id}:${w}`).join(' ')}`,
      color: 0x94a3b8,
    },
  ],
  minWidth: gridW,
});
title.y = 0;

// Headroom for the title, so the grid starts under it.
const PAD_TOP = title.plateHeight + 8;
const gridBottom = PAD_TOP + ROWS * (SIZE + GAP) - GAP;

const stage = new PIXI.Container();
reelSet.y = PAD_TOP;
stage.addChild(reelSet);
stage.addChild(title);

for (let i = 0; i < COLS; i++) {
  const scoped = CAPTIONS[i] !== 'base table';
  // The index goes on the demo, not just in the source: reel indices are
  // 0-based, so `{ reel: 2 }` is the THIRD reel, not the second. One plaque
  // per reel, the index as its heading and the rule under it, green where a
  // pool changes the draw. Tight side padding so 'low cards only' still fits
  // its own column.
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
  nextResult: () =>
    // A perfectly ordinary server result. The pools never touch it.
    Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => {
        const pool = Math.random() < 0.5 ? LOW : HIGH;
        return pool[Math.floor(Math.random() * pool.length)];
      }),
    ),
};
