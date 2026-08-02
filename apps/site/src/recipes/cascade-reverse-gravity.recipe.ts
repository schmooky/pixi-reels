// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, app

// Spin one way, drop the other.
//
// These reels roll UP (`.direction('reverse')`), but the tumble is told to
// settle DOWN (`tumble({ gravity: 'forward' })`). Gravity is separable from
// travel precisely so a set can do this; the default `'auto'` ties them
// together, which is what you want for everything else.
//
// Two consequences, and they are the whole recipe:
//   - The opening drop and every refill enter from the TOP and land downward,
//     even though the strip-spin phase travels upward.
//   - Because gravity exits through the bottom edge, the server must pack
//     survivors against the LAST cells: `[...fresh, ...survivors]`. Leave
//     gravity at 'auto' on a reverse reel and the whole contract flips -
//     survivors pack against cell 0 and `nextGrid` returns
//     `[...survivors, ...fresh]` instead.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 5, CELLS = 4, SIZE = 68;
const RUN = 3;
const HIT_CELL = 1, HIT_ID = 'Q';

const rand = () => IDS[Math.floor(Math.random() * IDS.length)];
const randExcept = (id) => {
  let s;
  do { s = rand(); } while (s === id);
  return s;
};

// Any 3+ adjacent reels showing the same symbol on the same cell pays.
function linesIn(grid) {
  const winners = [];
  for (let cell = 0; cell < CELLS; cell++) {
    let start = 0;
    for (let reel = 1; reel <= REELS; reel++) {
      if (reel === REELS || grid[reel][cell] !== grid[start][cell]) {
        if (reel - start >= RUN) {
          for (let k = start; k < reel; k++) winners.push({ reel: k, cell });
        }
        start = reel;
      }
    }
  }
  return winners;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .direction('reverse') // roll-up: the strip travels toward the top edge
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .weights(Object.fromEntries(IDS.map((id) => [id, 1])))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 110 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in', cellStagger: 60 },
    dropIn: { duration: 440, ease: 'power2.in', cellStagger: 60, distance: 'perHole' },
    gravity: 'forward', // <- drop down while the reels spin up
  })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => randExcept(HIT_ID)),
    );
    for (let reel = 0; reel < RUN; reel++) grid[reel][HIT_CELL] = HIT_ID;

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await spinDone;
    await new Promise((r) => setTimeout(r, 300));

    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: (g, chain) => (chain >= 3 ? [] : linesIn(g)),
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
          // gravity: 'forward' -> survivors pack against the bottom.
          return { visible: [...fresh, ...survivors] };
        });
      },
      pauseAfterDestroyMs: 220,
    });
  },
};
