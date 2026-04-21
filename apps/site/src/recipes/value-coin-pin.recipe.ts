// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Value-carrying coin symbols — the foundation of Hold & Win features.
//
// Each coin symbol carries a payout value in its pin payload. The engine
// keeps the coin in place across spins; game code reads payload.value to
// sum the final payout. A running total is displayed live.
//
// This replaces CheatEngine._applyHeld() — previously used as production
// logic. Here, pins carry everything: symbol identity + value + persistence.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const COIN = 'wild/wild_1'; // treat "wild" sprite as coin for this demo
const COLS = 5, ROWS = 3, SIZE = 90;
const COIN_VALUES = [10, 25, 50, 100];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, COIN]) {
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

// ── Value badges + total display (pure presentation) ─────────────────────
const badgeLayer = new PIXI.Container();
reelSet.addChild(badgeLayer);
const badges = new Map();

const totalText = new PIXI.Text({
  text: 'TOTAL: 0',
  style: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 20,
    fontWeight: '700',
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 4 },
  },
});
totalText.x = 8;
totalText.y = ROWS * (SIZE + 4) + 8;
badgeLayer.addChild(totalText);

function redrawTotal() {
  let total = 0;
  for (const pin of reelSet.pins.values()) {
    if (typeof pin.payload?.value === 'number') total += pin.payload.value;
  }
  totalText.text = `TOTAL: ${total}`;
}

function drawValueBadge(col, row, value) {
  const key = `${col}:${row}`;
  const existing = badges.get(key);
  if (existing) { try { existing.destroy(); } catch {} }
  const badge = new PIXI.Text({
    text: String(value),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 20,
      fontWeight: '900',
      fill: 0xffd43b,
      stroke: { color: 0x000000, width: 4 },
    },
  });
  badge.anchor.set(0.5);
  badge.x = col * (SIZE + 4) + SIZE / 2;
  badge.y = row * (SIZE + 4) + SIZE / 2;
  badgeLayer.addChild(badge);
  badges.set(key, badge);
}

reelSet.events.on('pin:placed', (pin) => {
  if (typeof pin.payload?.value === 'number') {
    drawValueBadge(pin.col, pin.row, pin.payload.value);
    redrawTotal();
  }
});

reelSet.events.on('pin:expired', (pin) => {
  const key = `${pin.col}:${pin.row}`;
  const badge = badges.get(key);
  if (badge) { try { badge.destroy(); } catch {} badges.delete(key); }
  redrawTotal();
});

// ── Pin coins permanently on land ────────────────────────────────────────
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === COIN && !reelSet.getPin(c, r)) {
        const value = COIN_VALUES[Math.floor(Math.random() * COIN_VALUES.length)];
        reelSet.pin(c, r, COIN, {
          turns: 'permanent',
          payload: { value },
        });
      }
    }
  }
});

// Scripted: one new coin per spin, cycling positions.
const arrivals = [
  { col: 0, row: 0 }, { col: 2, row: 1 }, { col: 4, row: 2 },
  { col: 1, row: 2 }, { col: 3, row: 0 }, { col: 2, row: 0 },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const idx = spinCount % arrivals.length;
    // At the start of the cycle, release everything for a clean demo loop.
    if (idx === 0) {
      for (const pin of [...reelSet.pins.values()]) {
        reelSet.unpin(pin.col, pin.row);
      }
    }
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    const next = arrivals[idx];
    grid[next.col][next.row] = COIN;
    spinCount++;
    return grid;
  },
  cleanup: () => {
    try { badgeLayer.destroy({ children: true }); } catch {}
  },
};
