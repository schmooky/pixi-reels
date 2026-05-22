// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   CoinSymbol, WILD_CARD, PIXI, gsap, app, pickWeighted
//
// Multiplier wild. the wild carries a per-instance multiplier value.
//
// CellPin's `payload` field stores arbitrary per-instance data alongside the
// symbol. Game layer reads it during win evaluation to scale payouts.
//
// We overlay the multiplier value as a PIXI text stamp on the wild coin's
// face whenever a multiplier wild is pinned. Filler cards stay rectangular
// (they're playing-card themed). only the wild renders as a coin.

const FILLER = ['7', '8', '10', 'Q'];
const WILD = WILD_CARD.id;
const COLS = 5, ROWS = 3, SIZE = 90;
const MULTIPLIERS = [2, 3, 5];
const STICKY_TURNS = 3;

// Blank gold coin for the wild. The multiplier "stamp" is drawn on top in
// the badge layer below.
const WILD_COIN = { rimColor: 0xb8860b, faceColor: 0xf5d066 };

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
    r.register(WILD, CoinSymbol, WILD_COIN);
  })
  .weights({
    '7': 22,
    '8': 22,
    '10': 18,
    Q: 18,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Multiplier stamps (display layer) ────────────────────────────────────
// A separate PIXI container draws each pinned wild's xN value centered on
// the coin's face. Centered, dark text — reads as embossed on the coin.
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
    text: `x${multiplier}`,
    style: {
      fontFamily:
        '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", "Liberation Sans Narrow", system-ui, sans-serif',
      fontSize: Math.floor(SIZE * 0.32),
      fontWeight: '900',
      fill: 0x3a2900,
      align: 'center',
    },
  });
  badge.anchor.set(0.5);
  // Centered on the coin's face.
  badge.x = col * (SIZE + 4) + SIZE / 2;
  badge.y = row * (SIZE + 4) + SIZE / 2;
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
