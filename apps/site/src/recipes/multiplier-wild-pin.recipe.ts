// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   CoinSymbol, coinMultiplier, WILD_CARD, PIXI, gsap, app, pickWeighted
//
// Multiplier wild. the wild carries a per-instance multiplier value.
//
// Each multiplier rung is its own WILD variant — the strip rolls
// `wild_x2` / `wild_x3` / `wild_x5` as distinct symbols, so the player
// sees the multiplier on the coin's face during the spin (not a blank
// coin that "becomes" multiplied on stop).
//
// CellPin's `payload` field still carries the numeric multiplier alongside
// the symbol so game-layer win evaluation can read it without parsing the
// symbol id. Filler cards stay rectangular (they're playing-card themed).

const FILLER = ['7', '8', '10', 'Q'];
const COLS = 5, ROWS = 3, SIZE = 90;
const MULTIPLIERS = [2, 3, 5];
const STICKY_TURNS = 3;
const wildId = (m) => `wild_x${m}`;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
    for (const m of MULTIPLIERS) {
      r.register(wildId(m), CoinSymbol, coinMultiplier(m));
    }
  })
  .weights({
    '7': 22,
    '8': 22,
    '10': 18,
    Q: 18,
    // Wilds land via scripted arrivals only. omit from weights to keep
    // them off the random strip.
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Pin wilds with their multiplier on land ───────────────────────────────
// The multiplier is encoded in the wild's symbolId (wild_x2, wild_x3,
// wild_x5). On land we re-pin with `payload.multiplier` so game code can
// read the value numerically without parsing the id string.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      const id = symbols[c][r];
      if (!id?.startsWith?.('wild_x')) continue;
      if (reelSet.getPin(c, r)) continue;
      const multiplier = Number(id.slice('wild_x'.length));
      reelSet.pin(c, r, id, {
        turns: STICKY_TURNS,
        payload: { multiplier },
      });
    }
  }
});

// Scripted arrivals — one of each multiplier rung across the demo loop.
const arrivals = [
  { col: 1, row: 1, mult: 2 },
  { col: 3, row: 0, mult: 3 },
  { col: 2, row: 2, mult: 5 },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const idx = spinCount % arrivals.length;
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    const next = arrivals[idx];
    grid[next.col][next.row] = wildId(next.mult);
    spinCount++;
    return grid;
  },
};
