// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Collector symbol (Cash Noire mechanic).
//
// When the collector lands, it reads the payloads of adjacent value-carrying
// coin pins and absorbs their values. Collected coins are unpinned; the
// collector itself is pinned permanently with the accumulated total.
//
// This is the clearest demo of CellPin payload + cross-pin coordination.
// The library gives us `reelSet.pins` as a readable map — game logic iterates
// over it to find neighbors.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1'];
const COIN = 'wild/wild_1';
const COLLECTOR = 'square/square_1';
const COLS = 5, ROWS = 3, SIZE = 90;
const COIN_VALUES = [10, 25, 50, 100];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, COIN, COLLECTOR]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 30,
    'round/round_2': 30,
    'royal/royal_1': 20,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Value badge display ──────────────────────────────────────────────────
const badgeLayer = new PIXI.Container();
reelSet.addChild(badgeLayer);
const badges = new Map();

function drawBadge(col, row, text, color = 0xffd43b) {
  const key = `${col}:${row}`;
  const existing = badges.get(key);
  if (existing) { try { existing.destroy(); } catch {} }
  const badge = new PIXI.Text({
    text: String(text),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 18,
      fontWeight: '900',
      fill: color,
      stroke: { color: 0x000000, width: 4 },
    },
  });
  badge.anchor.set(0.5);
  badge.x = col * (SIZE + 4) + SIZE / 2;
  badge.y = row * (SIZE + 4) + SIZE / 2;
  badgeLayer.addChild(badge);
  badges.set(key, badge);
}

function clearBadge(col, row) {
  const key = `${col}:${row}`;
  const badge = badges.get(key);
  if (badge) { try { badge.destroy(); } catch {} badges.delete(key); }
}

reelSet.events.on('pin:placed', (pin) => {
  if (typeof pin.payload?.value === 'number') {
    const isCollector = pin.symbolId === COLLECTOR;
    drawBadge(pin.col, pin.row, pin.payload.value, isCollector ? 0x90ee90 : 0xffd43b);
  }
});

reelSet.events.on('pin:expired', (pin) => clearBadge(pin.col, pin.row));

// ── Collector logic: absorb adjacent coin payloads on land ───────────────
// Neighbors = orthogonal (up/down/left/right) adjacency.
function neighborsOf(col, row) {
  return [
    { col: col - 1, row },
    { col: col + 1, row },
    { col, row: row - 1 },
    { col, row: row + 1 },
  ];
}

reelSet.events.on('spin:allLanded', ({ symbols }) => {
  // First pass: pin every landed coin with a value, if not already pinned.
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === COIN && !reelSet.getPin(c, r)) {
        const value = COIN_VALUES[Math.floor(Math.random() * COIN_VALUES.length)];
        reelSet.pin(c, r, COIN, { turns: 'permanent', payload: { value } });
      }
    }
  }

  // Second pass: for each landed collector, sum adjacent pinned coin values.
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] !== COLLECTOR) continue;

      let total = 0;
      for (const n of neighborsOf(c, r)) {
        const pin = reelSet.getPin(n.col, n.row);
        if (pin?.symbolId === COIN && typeof pin.payload?.value === 'number') {
          total += pin.payload.value;
          reelSet.unpin(n.col, n.row);
        }
      }

      if (total > 0) {
        reelSet.pin(c, r, COLLECTOR, {
          turns: 'permanent',
          payload: { value: total },
        });
      }
    }
  }
});

// Scripted demo: coins accumulate over spins 0–2, collector lands spin 3.
const scripts = [
  { coins: [{ c: 1, r: 1, v: 50 }], collector: null },
  { coins: [{ c: 2, r: 1, v: 25 }], collector: null },
  { coins: [{ c: 1, r: 2, v: 100 }], collector: null },
  { coins: [], collector: { c: 2, r: 2 } }, // collector absorbs 25+100
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const idx = spinCount % scripts.length;
    if (idx === 0) {
      for (const pin of [...reelSet.pins.values()]) reelSet.unpin(pin.col, pin.row);
    }
    const script = scripts[idx];
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    for (const c of script.coins) grid[c.c][c.r] = COIN;
    if (script.collector) grid[script.collector.c][script.collector.r] = COLLECTOR;
    spinCount++;
    return grid;
  },
  cleanup: () => { try { badgeLayer.destroy({ children: true }); } catch {} },
};
