// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Sticky wild on a Megaways slot. Pin a wild on land with `originRow` set;
// the pin survives every Megaways reshape. When the next shape is shorter
// than originRow, the pin clamps to the last visible row (`pin:migrated`
// fires with clamped:true). When a later, larger shape can fit the
// originRow again, the pin migrates back — no wander.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'royal/royal_2'];
const WILD = 'wild/wild_1';
const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 2;
const STICKY_TURNS = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .megaways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  // Reshape tween — duration + GSAP ease are configurable.
  .adjustDuration(300)
  .adjustEase('power2.inOut')
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of [...FILLER, WILD]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 22, 'round/round_2': 22,
    'royal/royal_1': 14, 'royal/royal_2': 14,
  })
  .symbolData({ [WILD]: { weight: 2, zIndex: 5 } })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// On every landing, pin every wild for STICKY_TURNS spins. Each pin captures
// its current row as `originRow` automatically — that's what lets the
// engine restore the pin to its original row when shapes grow back.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] !== WILD) continue;
      if (reelSet.getPin(c, r)) continue;
      reelSet.pin(c, r, WILD, { turns: STICKY_TURNS });
    }
  }
});

// Cycle shapes so the demo deterministically shows clamp + restore.
const SHAPE_CYCLE: number[][] = [
  [5, 5, 5, 5, 5, 5],
  [3, 3, 3, 3, 3, 3], // shrinks — high-row wilds clamp
  [7, 7, 7, 7, 7, 7], // grows back — clamped wilds migrate back to originRow
  [4, 4, 4, 4, 4, 4],
];
let spinCount = 0;
let plantedWild = false;

return {
  reelSet,
  nextResult: () => {
    const shape = SHAPE_CYCLE[spinCount++ % SHAPE_CYCLE.length];
    reelSet.setShape(shape);
    const grid: string[][] = shape.map((rows) =>
      Array.from({ length: rows }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    // Plant a wild high up on the first spin so the clamp/restore is visible.
    if (!plantedWild) {
      grid[2][4 % shape[2]] = WILD; // wild on column 2, near the top
      plantedWild = true;
    }
    return grid;
  },
};
