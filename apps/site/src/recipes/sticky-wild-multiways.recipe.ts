// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, textures, blurTextures,
//                   SYMBOL_IDS, pickWeighted
//
// Sticky wild on a MultiWays slot. Pin a wild on land with `originRow` set;
// the pin survives every MultiWays reshape. When the next shape is shorter
// than originRow, the pin clamps to the last visible row (`pin:migrated`
// fires with clamped:true). When a later, larger shape can fit the
// originRow again, the pin migrates back — no wander.
//
// CARD SYMBOLS BELOW ARE DEBUG/PROTOTYPING ONLY — see /recipes/card-symbol-debug/.

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 480;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 0;
const STICKY_TURNS = 3;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .pinMigrationDuration(300)
  .pinMigrationEase('power2.inOut')
  .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
    registry.register(WILD_CARD.id, CardSymbol, {
      color: WILD_CARD.color,
      label: WILD_CARD.label,
      textColor: WILD_CARD.textColor,
    });
  })
  .weights(Object.fromEntries([...CARD_DECK.map((c, i) => [c.id, 12 - i]), [WILD_CARD.id, 2]]))
  .symbolData({ [WILD_CARD.id]: { weight: 2, zIndex: 5 } })
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
      if (symbols[c][r] !== WILD_CARD.id) continue;
      if (reelSet.getPin(c, r)) continue;
      reelSet.pin(c, r, WILD_CARD.id, { turns: STICKY_TURNS });
    }
  }
});

// Cycle shapes so the demo deterministically shows clamp + restore.
const SHAPE_CYCLE = [
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
    const grid = shape.map((rows) =>
      Array.from({ length: rows }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );
    // Plant a wild high up on the first spin so the clamp/restore is visible.
    if (!plantedWild) {
      grid[2][Math.min(4, shape[2] - 1)] = WILD_CARD.id;
      plantedWild = true;
    }
    return grid;
  },
};
