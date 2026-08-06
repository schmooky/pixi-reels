// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, app
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
const PAD_TOP = 30;
const gridBottom = PAD_TOP + ROWS * (SIZE + GAP) - GAP;

const stage = new PIXI.Container();
reelSet.y = PAD_TOP;
stage.addChild(reelSet);

const title = new PIXI.Text({
  text: 'one weights() table, three per-reel pools on top',
  style: { fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: '700', fill: 0x475569 },
});
title.y = 0;
stage.addChild(title);

for (let i = 0; i < COLS; i++) {
  const scoped = CAPTIONS[i] !== 'base table';
  const caption = new PIXI.Text({
    text: CAPTIONS[i],
    style: {
      fontFamily: 'ui-monospace, monospace',
      fontSize: 10,
      fontWeight: scoped ? '700' : '500',
      fill: scoped ? 0x16a34a : 0x94a3b8,
    },
  });
  caption.anchor.set(0.5, 0);
  caption.x = i * (SIZE + GAP) + SIZE / 2;
  caption.y = gridBottom + 8;
  stage.addChild(caption);
}

// The engine only reports what it will draw; assert your own config with it.
// eslint-disable-next-line no-console -- the point of the line is to be read
console.log('reel 2 draw table:', reelSet.randomSymbols.weights({ reel: 2 }));

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
