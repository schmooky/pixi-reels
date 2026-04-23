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
  const current = [...reelSet.pins.values()];
  for (const pin of current) {
    if (pin.col <= 0) {
      reelSet.unpin(pin.col, pin.row);
      continue;
    }
    await reelSet.movePin(
      { col: pin.col, row: pin.row },
      { col: pin.col - 1, row: pin.row },
      {
        duration: 350,
        easing: 'power2.inOut',
        // onFlightCreated / onFlightCompleted give you the pooled flight
        // ReelSymbol. For a Spine asset this is where you'd set a `run`
        // animation track for the flight duration. Here the symbol is a
        // plain sprite, so we add a scale pulse to make the hook visible.
        onFlightCreated: (flight) => {
          flight.view.scale.set(1);
          gsap.to(flight.view.scale, {
            x: 1.22,
            y: 1.22,
            duration: 0.18,
            ease: 'sine.out',
            yoyo: true,
            repeat: 1,
          });
        },
        onFlightCompleted: (flight) => {
          gsap.killTweensOf(flight.view.scale);
          flight.view.scale.set(1, 1);
        },
      },
    );
  }
}

// Overlay event hook — fires whenever an overlay ReelSymbol is created
// (at spin:start for every active pin). This is the Spine-animation hook:
// for a SpineSymbol you'd cast and call `overlay.setAnimation('idle', true)`
// or similar. Here we give every sticky-wild overlay a gentle pulse so it's
// distinct from the final cell render on land.
reelSet.events.on('pin:overlayCreated', (_pin, overlay) => {
  gsap.fromTo(
    overlay.view,
    { alpha: 0.7 },
    { alpha: 1, duration: 0.4, repeat: -1, yoyo: true, ease: 'sine.inOut' },
  );
});

reelSet.events.on('pin:overlayDestroyed', (_pin, overlay) => {
  gsap.killTweensOf(overlay.view);
  overlay.view.alpha = 1;
});

reelSet.events.on('spin:allLanded', ({ symbols }) => {
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
