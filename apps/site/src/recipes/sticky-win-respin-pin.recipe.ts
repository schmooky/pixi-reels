// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, pickWeighted
//
// Sticky-win respin (Dead or Alive II / Razor Shark mechanic).
//
// When a winning combination lands, the winning symbols lock in place.
// All non-winning cells respin. The respin counter resets every time a
// new winner lands; the feature ends when no new winner appears AND the
// counter runs out (or a max-respin cap is reached).
//
// CellPin with numeric `turns` provides the lock lifecycle for free.
// "any 3 in a cell" counts as a win for this demo.

const FILLER = ['7', '8', '10', 'Q'];
const COLS = 5, ROWS = 3, SIZE = 90;
const RESPIN_WINDOW = 2; // symbol stays pinned for 2 additional respins

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights({
    '7': 30,
    '8': 30,
    '10': 20,
    Q: 20,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Overlay that dims non-winning cells while winners are locked.
const lockLayer = new PIXI.Graphics();
reelSet.addChild(lockLayer);

function redrawLocks() {
  lockLayer.clear();
  for (const pin of reelSet.pins.values()) {
    // Subtle gold border around locked cells
    lockLayer
      .rect(
        pin.reel * (SIZE + 4),
        pin.cell * (SIZE + 4),
        SIZE,
        SIZE,
      )
      .stroke({ width: 3, color: 0xffd43b, alpha: 0.9 });
  }
}

reelSet.events.on('pin:placed', redrawLocks);
reelSet.events.on('pin:expired', redrawLocks);

// ── Winner detection: any 3 same symbols in a horizontal cell ─────────────
function detectWinners(grid) {
  const winners = []; // { reel, cell, symbolId }
  for (let cell = 0; cell < ROWS; cell++) {
    // Find runs of same symbol in this cell
    let runStart = 0;
    for (let reel = 1; reel <= COLS; reel++) {
      if (reel === COLS || grid[reel][cell] !== grid[runStart][cell]) {
        const runLength = reel - runStart;
        if (runLength >= 3) {
          for (let c = runStart; c < reel; c++) {
            winners.push({ reel: c, cell, symbolId: grid[c][cell] });
          }
        }
        runStart = reel;
      }
    }
  }
  return winners;
}

// After each landing, pin the winners so they persist for the respin window.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  const winners = detectWinners(symbols);
  if (winners.length === 0) return;

  for (const w of winners) {
    // If already pinned, refresh its lifetime; otherwise new pin.
    reelSet.pin(w.reel, w.cell, w.symbolId, { turns: RESPIN_WINDOW });
  }
});

// Scripted: spin 0 sets up a near-miss, spin 1 lands a win, spin 2 shows
// the winners locked + non-winners respun, spin 3 lets them expire.
const scripts = [
  // Spin 0: random
  () =>
    Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    ),
  // Spin 1: 3-of-a-kind on cell 1 across reels 0,1,2
  () => {
    const g = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    g[0][1] = '10';
    g[1][1] = '10';
    g[2][1] = '10';
    return g;
  },
  // Spin 2: respin. winners are still pinned, non-winners get fresh symbols
  () =>
    Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    ),
  // Spin 3: another respin. winners still pinned from previous turn decrement
  () =>
    Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    ),
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const grid = scripts[spinCount % scripts.length]();
    spinCount++;
    return grid;
  },
  cleanup: () => { try { lockLayer.destroy(); } catch {} },
};
