// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Walking wild — CellPin.movePin() edition.
//
// The wild migrates one column left between spins. No ghost sprite, no
// stage-level overlay: the engine reparents a pooled symbol to the viewport's
// unmaskedContainer, tweens it across reel boundaries, and cleanly releases
// it back to the pool. State is atomic; the pin coordinates in the map flip
// before the animation starts.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const COLS = 5, ROWS = 3, SIZE = 90;

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

// ── Walk the wild ────────────────────────────────────────────────────────
// After each spin lands, pin every new wild (if any) at its landing cell,
// then walk every existing pin one column to the left. When a wild reaches
// column 0, unpin it — it has walked off the board.
async function walkPinsLeft() {
  // Snapshot the pins before we modify, so we iterate a stable set
  const current = [...reelSet.pins.values()];
  for (const pin of current) {
    if (pin.col <= 0) {
      reelSet.unpin(pin.col, pin.row);
      continue;
    }
    await reelSet.movePin(
      { col: pin.col, row: pin.row },
      { col: pin.col - 1, row: pin.row },
      { duration: 350, easing: 'power2.inOut' },
    );
  }
}

reelSet.events.on('spin:allLanded', ({ symbols }) => {
  // Pin any newly-landed wilds that aren't already pinned.
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === WILD && !reelSet.getPin(c, r)) {
        reelSet.pin(c, r, WILD, { turns: 'permanent' });
      }
    }
  }
});

// Script: arrive on reel 4, then walk left on each subsequent spin.
const arrivals = [
  { col: 4, row: 1 },
  null, // no new wild — existing one walks
  null,
  null,
  { col: 3, row: 2 }, // a second walker arrives
  null,
];
let spinCount = 0;

return {
  reelSet,
  onSpin: async () => {
    // Before spinning, walk any existing pins one step left.
    if (!reelSet.isSpinning) await walkPinsLeft();

    const promise = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));

    const arrival = arrivals[spinCount % arrivals.length];
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () =>
        FILLER[Math.floor(Math.random() * FILLER.length)],
      ),
    );
    if (arrival) grid[arrival.col][arrival.row] = WILD;
    reelSet.setResult(grid);
    await promise;
    spinCount++;
  },
};
