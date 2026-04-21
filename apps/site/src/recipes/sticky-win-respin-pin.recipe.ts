// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Sticky-win respin (Dead or Alive II / Razor Shark mechanic).
//
// When a winning combination lands, the winning symbols lock in place.
// All non-winning cells respin. The respin counter resets every time a
// new winner lands; the feature ends when no new winner appears AND the
// counter runs out (or a max-respin cap is reached).
//
// CellPin with numeric `turns` provides the lock lifecycle for free.
// Simple "any 3 in a row" counts as a win for this demo.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const COLS = 5, ROWS = 3, SIZE = 90;
const RESPIN_WINDOW = 2; // symbol stays pinned for 2 additional respins

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of FILLER) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 30,
    'round/round_2': 30,
    'royal/royal_1': 20,
    'square/square_1': 20,
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
        pin.col * (SIZE + 4),
        pin.row * (SIZE + 4),
        SIZE,
        SIZE,
      )
      .stroke({ width: 3, color: 0xffd43b, alpha: 0.9 });
  }
}

reelSet.events.on('pin:placed', redrawLocks);
reelSet.events.on('pin:expired', redrawLocks);

// ── Winner detection: any 3 same symbols in a horizontal row ─────────────
function detectWinners(grid) {
  const winners = []; // { col, row, symbolId }
  for (let row = 0; row < ROWS; row++) {
    // Find runs of same symbol in this row
    let runStart = 0;
    for (let col = 1; col <= COLS; col++) {
      if (col === COLS || grid[col][row] !== grid[runStart][row]) {
        const runLength = col - runStart;
        if (runLength >= 3) {
          for (let c = runStart; c < col; c++) {
            winners.push({ col: c, row, symbolId: grid[c][row] });
          }
        }
        runStart = col;
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
    reelSet.pin(w.col, w.row, w.symbolId, { turns: RESPIN_WINDOW });
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
  // Spin 1: 3-of-a-kind on row 1 across reels 0,1,2
  () => {
    const g = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    g[0][1] = 'royal/royal_1';
    g[1][1] = 'royal/royal_1';
    g[2][1] = 'royal/royal_1';
    return g;
  },
  // Spin 2: respin — winners are still pinned, non-winners get fresh symbols
  () =>
    Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    ),
  // Spin 3: another respin — winners still pinned from previous turn decrement
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
