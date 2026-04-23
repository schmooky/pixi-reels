// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Sticky wild — CellPin edition.
//
// Instead of manually tracking "stuck" positions in an array and re-injecting
// them into the grid before every setResult(), we just call reelSet.pin() when
// a wild lands. The engine's pin map handles persistence; the wild stays put
// for the configured number of turns, then expires automatically.
//
// No ghost sprites. No external state. No grid re-injection.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const COLS = 5, ROWS = 3, SIZE = 90;
const STICKY_TURNS = 3;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, WILD]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 22,
    'round/round_2': 22,
    'royal/royal_1': 18,
    'square/square_1': 18,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Pin wilds on land ────────────────────────────────────────────────────
// When a wild lands on a cell that isn't already pinned, pin it for N turns.
// The engine decrements turns after each spin:allLanded and fires pin:expired
// when turns hits zero.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === WILD && !reelSet.getPin(c, r)) {
        reelSet.pin(c, r, WILD, { turns: STICKY_TURNS });
      }
    }
  }
});

// Scripted sequence: cycles through wild arrivals so the demo is predictable.
const arrivals = [
  { col: 1, row: 1 },
  { col: 3, row: 0 },
  { col: 2, row: 2 },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const idx = spinCount % arrivals.length;
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    // Place a fresh wild each spin — the engine's pin overlay keeps prior
    // sticky wilds in place, so we only ever need to add the NEW one here.
    const next = arrivals[idx];
    grid[next.col][next.row] = WILD;
    spinCount++;
    return grid;
  },
};
