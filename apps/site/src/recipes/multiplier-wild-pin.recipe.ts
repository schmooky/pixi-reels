// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Multiplier wild — the wild carries a per-instance multiplier value.
//
// CellPin's `payload` field stores arbitrary per-instance data alongside the
// symbol. Game layer reads it during win evaluation to scale payouts.
//
// We overlay the multiplier value as a PIXI text badge on top of the symbol
// sprite whenever a multiplier wild is pinned or repositioned.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const COLS = 5, ROWS = 3, SIZE = 90;
const MULTIPLIERS = [2, 3, 5];
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

// ── Multiplier badges (display layer) ────────────────────────────────────
// A separate PIXI container overlays ×N badges on the reel.
const badgeLayer = new PIXI.Container();
reelSet.addChild(badgeLayer);

const badges = new Map(); // key = "col:row" -> PIXI.Text

function clearBadge(col, row) {
  const key = `${col}:${row}`;
  const badge = badges.get(key);
  if (badge) {
    try { badge.destroy(); } catch {}
    badges.delete(key);
  }
}

function drawBadge(col, row, multiplier) {
  clearBadge(col, row);
  const badge = new PIXI.Text({
    text: `×${multiplier}`,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 22,
      fontWeight: '900',
      fill: 0xffd43b,
      stroke: { color: 0x000000, width: 4 },
    },
  });
  badge.anchor.set(0.5);
  // Position: top-right of the cell
  badge.x = col * (SIZE + 4) + SIZE - 16;
  badge.y = row * (SIZE + 4) + 16;
  badgeLayer.addChild(badge);
  badges.set(`${col}:${row}`, badge);
}

reelSet.events.on('pin:placed', (pin) => {
  const mult = pin.payload?.multiplier;
  if (typeof mult === 'number') {
    drawBadge(pin.col, pin.row, mult);
  }
});

reelSet.events.on('pin:expired', (pin) => {
  clearBadge(pin.col, pin.row);
});

// ── Pin wilds with a random multiplier on land ───────────────────────────
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === WILD && !reelSet.getPin(c, r)) {
        const mult = MULTIPLIERS[Math.floor(Math.random() * MULTIPLIERS.length)];
        reelSet.pin(c, r, WILD, {
          turns: STICKY_TURNS,
          payload: { multiplier: mult },
        });
      }
    }
  }
});

// Scripted arrivals.
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
    const next = arrivals[idx];
    grid[next.col][next.row] = WILD;
    spinCount++;
    return grid;
  },
  cleanup: () => {
    try { badgeLayer.destroy({ children: true }); } catch {}
  },
};
