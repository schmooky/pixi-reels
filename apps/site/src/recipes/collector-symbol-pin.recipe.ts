// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted, EmptySymbol
//
// Collector symbol on a Hold & Win board.
//
// Same 15-mini-ReelSet architecture as value-coin-pin. Coins land and are
// pinned with a payload.value. When a collector lands adjacent to pinned
// coins, it absorbs every adjacent coin's payload and stores the total in
// its own pin payload. Absorbed coins are unpinned — they "fly" to the
// collector conceptually, though here we just update badges.

const COIN = 'feature/feature_1';
const COLLECTOR = 'wild/wild_1';
const EMPTY = 'empty';
const COLS = 5, ROWS = 3, CELL = 60, GAP = 4;
const COIN_VALUES = [10, 25, 50, 100];

const colWidth = COLS * (CELL + GAP) - GAP;
const colHeight = ROWS * (CELL + GAP) - GAP;
const startX = (app.screen.width - colWidth) / 2;
const startY = (app.screen.height - colHeight) / 2 - 18;

const cells = [];
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const mini = new ReelSetBuilder()
      .reels(1).visibleSymbols(1)
      .symbolSize(CELL, CELL).symbolGap(0, 0)
      .symbols((r) => {
        r.register(COIN, BlurSpriteSymbol, { textures, blurTextures });
        r.register(COLLECTOR, BlurSpriteSymbol, { textures, blurTextures });
        r.register(EMPTY, EmptySymbol, {});
      })
      .weights({ [COIN]: 2, [COLLECTOR]: 1, [EMPTY]: 6 })
      .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 320 + (col + row) * 60 })
      .ticker(app.ticker)
      .build();
    mini.x = startX + col * (CELL + GAP);
    mini.y = startY + row * (CELL + GAP);
    app.stage.addChild(mini);
    cells.push({ col, row, reelSet: mini });
  }
}

// ── Value badges + total ────────────────────────────────────────────────
const badges = new Map();
const totalText = new PIXI.Text({
  text: 'TOTAL: 0',
  style: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 22,
    fontWeight: '800',
    fill: 0xfef08a,
    stroke: { color: 0x000000, width: 4 },
  },
});
totalText.anchor.set(0.5, 0);
totalText.x = startX + colWidth / 2;
totalText.y = startY + colHeight + 14;
app.stage.addChild(totalText);

function drawBadge(cell, value, isCollector = false) {
  const key = `${cell.col},${cell.row}`;
  const existing = badges.get(key);
  if (existing) { try { existing.destroy(); } catch {} }
  const badge = new PIXI.Text({
    text: String(value),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 18,
      fontWeight: '900',
      fill: isCollector ? 0x90ee90 : 0xffd43b,
      stroke: { color: 0x000000, width: 4 },
    },
  });
  badge.anchor.set(0.5);
  badge.x = cell.reelSet.x + CELL / 2;
  badge.y = cell.reelSet.y + CELL / 2;
  app.stage.addChild(badge);
  badges.set(key, badge);
}

function clearBadge(col, row) {
  const key = `${col},${row}`;
  const badge = badges.get(key);
  if (badge) { try { badge.destroy(); } catch {} badges.delete(key); }
}

function cellAt(col, row) {
  return cells.find((c) => c.col === col && c.row === row);
}

function recomputeTotal() {
  let total = 0;
  for (const cell of cells) {
    const pin = cell.reelSet.getPin(0, 0);
    if (typeof pin?.payload?.value === 'number') total += pin.payload.value;
  }
  totalText.text = `TOTAL: ${total}`;
}

for (const cell of cells) {
  cell.reelSet.events.on('pin:placed', (pin) => {
    if (typeof pin.payload?.value === 'number') {
      drawBadge(cell, pin.payload.value, pin.symbolId === COLLECTOR);
      recomputeTotal();
    }
  });
  cell.reelSet.events.on('pin:expired', () => {
    clearBadge(cell.col, cell.row);
    recomputeTotal();
  });
}

// ── Scripted demo: seed coins, then drop a collector in the middle ─────
const rounds = [
  { hits: [
    { col: 1, row: 1, type: 'coin' },
    { col: 2, row: 2, type: 'coin' },
    { col: 3, row: 1, type: 'coin' },
  ] },
  { hits: [
    { col: 2, row: 0, type: 'coin' },
  ] },
  { hits: [
    { col: 2, row: 1, type: 'collector' },
  ] },
];

return {
  cleanup: () => {
    for (const b of badges.values()) try { b.destroy(); } catch {}
    try { totalText.destroy(); } catch {}
    for (const c of cells) try { c.reelSet.destroy(); } catch {}
  },
  onSpin: async () => {
    for (const cell of cells) {
      if (cell.reelSet.getPin(0, 0)) cell.reelSet.unpin(0, 0);
    }

    for (const round of rounds) {
      const spinPromises = [];
      const activeCells = [];
      for (const cell of cells) {
        if (cell.reelSet.getPin(0, 0)) continue;
        activeCells.push(cell);
        spinPromises.push(cell.reelSet.spin());
      }

      await new Promise((r) => setTimeout(r, 140));
      for (const cell of activeCells) {
        const hit = round.hits.find((h) => h.col === cell.col && h.row === cell.row);
        const target = hit ? (hit.type === 'collector' ? COLLECTOR : COIN) : EMPTY;
        cell.reelSet.setResult([[target]]);
      }
      await Promise.all(spinPromises);

      for (const cell of activeCells) {
        const hit = round.hits.find((h) => h.col === cell.col && h.row === cell.row);
        if (!hit) continue;

        if (hit.type === 'coin') {
          const value = COIN_VALUES[Math.floor(Math.random() * COIN_VALUES.length)];
          cell.reelSet.pin(0, 0, COIN, { turns: 'permanent', payload: { value } });
          continue;
        }

        if (hit.type === 'collector') {
          const neighbors = [
            { col: cell.col - 1, row: cell.row },
            { col: cell.col + 1, row: cell.row },
            { col: cell.col, row: cell.row - 1 },
            { col: cell.col, row: cell.row + 1 },
          ];
          let total = 0;
          for (const n of neighbors) {
            const nCell = cellAt(n.col, n.row);
            if (!nCell) continue;
            const nPin = nCell.reelSet.getPin(0, 0);
            if (nPin?.symbolId === COIN && typeof nPin.payload?.value === 'number') {
              total += nPin.payload.value;
              nCell.reelSet.unpin(0, 0);
            }
          }
          cell.reelSet.pin(0, 0, COLLECTOR, {
            turns: 'permanent',
            payload: { value: total },
          });
        }
      }

      await new Promise((r) => setTimeout(r, 650));
    }
  },
};
