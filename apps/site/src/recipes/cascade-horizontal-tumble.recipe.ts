// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, app

// A full tumble cascade running SIDEWAYS.
//
// `.orientation('horizontal')` makes every reel a screen ROW whose strip
// travels along X; the reels themselves march down the Y axis. Nothing in the
// cascade setup changes: `tumble({ gravity })` defaults to `'auto'`, so each
// reel drains toward the edge it travels toward - right, here - and the refill
// enters from the left.
//
// The server contract travels with gravity: whichever edge gravity exits by is
// the edge SURVIVORS must be packed against in the grid you return. The engine
// animates the grid it is given, it never reorders it. Forward gravity packs
// survivors at the END of each reel's cells, so `nextGrid` returns
// `[...fresh, ...survivors]`.

const IDS = ['7', '8', '9', '10', 'J'];
const REELS = 4;   // 4 rows down the screen
const CELLS = 6;   // 6 cells along each row
const SIZE = 62;
const RUN = 3;     // 3 in a row pays
const HIT_REEL = 1, HIT_ID = '10', HIT_START = 2;

const rand = () => IDS[Math.floor(Math.random() * IDS.length)];

// Filler that never accidentally seeds a run, so the demo only pays where
// the script says it pays.
function fillerReel() {
  const out = [];
  for (let c = 0; c < CELLS; c++) {
    let s;
    do { s = rand(); } while (c >= 2 && out[c - 1] === s && out[c - 2] === s);
    out.push(s);
  }
  return out;
}

// Runs of 3+ identical symbols inside one reel. A reel is a row on screen, so
// this is the sideways twin of "3 in a column" - the rule is written in cell
// indices and never mentions the axis.
function runsIn(grid) {
  const winners = [];
  for (let reel = 0; reel < grid.length; reel++) {
    let start = 0;
    for (let cell = 1; cell <= CELLS; cell++) {
      if (cell === CELLS || grid[reel][cell] !== grid[reel][start]) {
        if (cell - start >= RUN) {
          for (let k = start; k < cell; k++) winners.push({ reel, cell: k });
        }
        start = cell;
      }
    }
  }
  return winners;
}

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  // Screen-space, always: the strip advances by the symbol WIDTH here, and
  // symbolGap.x is the along-strip gap while symbolGap.y separates the rows.
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .weights(Object.fromEntries(IDS.map((id) => [id, 1])))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in', cellStagger: 60 },
    dropIn: { duration: 430, ease: 'power2.in', cellStagger: 60, distance: 'perHole' },
    // gravity: 'auto' is the default and what you want here. Spelling it
    // 'forward' would be identical, since these reels travel forward.
  })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => fillerReel());
    for (let k = 0; k < RUN; k++) grid[HIT_REEL][HIT_START + k] = HIT_ID;

    // 'ltr' is reel order, not screen order: reel 0 lands first, which reads
    // top row down on a horizontal set.
    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await spinDone;
    await new Promise((r) => setTimeout(r, 300));

    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      // Stop the chain after three stages so the demo always ends.
      detectWinners: (g, chain) => (chain >= 3 ? [] : runsIn(g)),
      nextGrid: (prev, winners) => {
        const winsByReel = new Map();
        for (const w of winners) {
          const arr = winsByReel.get(w.reel) ?? [];
          arr.push(w.cell);
          winsByReel.set(w.reel, arr);
        }
        return prev.map((cells, reel) => {
          const wins = winsByReel.get(reel);
          if (!wins) return { visible: [...cells] };
          const survivors = cells.filter((_, cell) => !wins.includes(cell));
          const fresh = wins.map(() => rand());
          // Forward gravity: survivors keep their order and pack against the
          // exit edge (the last cells, i.e. screen right); the fresh symbols
          // stack behind them at the entry edge.
          return { visible: [...fresh, ...survivors] };
        });
      },
      pauseAfterDestroyMs: 220,
    });
  },
};
