// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CoinSymbol, COIN_FEATURE,
//                   coinMultiplier, PIXI, gsap, app, pickWeighted, EmptySymbol
//
// Collector coin on a Hold & Win board.
//
// Same 15-mini-ReelSet architecture as value-coin-pin. The value coins
// roll x2 / x5 / x10 / x20 / x50 with their coefficient on the face —
// each rung is its own CoinSymbol variant. When a blue COLLECT coin lands
// adjacent to pinned value coins, it sums their payloads, unpins them,
// and stores the total in its own pin payload.

const COLLECTOR = 'collector';
const EMPTY = 'empty';
const COLS = 5, ROWS = 3, CELL = 60, GAP = 4;

// Value-coin ladder. matches value-coin-pin so the two recipes feel like
// the same H&W board, just with the collector layered in.
const LADDER = [2, 5, 10, 20, 50];
const COIN_WEIGHTS = { 2: 12, 5: 6, 10: 4, 20: 2, 50: 1 };
const coinId = (v) => `coin_x${v}`;
const isCoinId = (id) => id?.startsWith?.('coin_x');
const valueOf = (id) => Number(id.slice('coin_x'.length));

const colWidth = COLS * (CELL + GAP) - GAP;
const colHeight = ROWS * (CELL + GAP) - GAP;
const startX = (app.screen.width - colWidth) / 2;
const startY = (app.screen.height - colHeight) / 2 - 18;

const cells = [];
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const mini = new ReelSetBuilder()
      .reels(1).visibleRows(1)
      .symbolSize(CELL, CELL).symbolGap(0, 0)
      .symbols((r) => {
        for (const v of LADDER) {
          r.register(coinId(v), CoinSymbol, coinMultiplier(v));
        }
        r.register(COLLECTOR, CoinSymbol, COIN_FEATURE.COLLECT);
        r.register(EMPTY, EmptySymbol, {});
      })
      .weights({
        ...Object.fromEntries(LADDER.map((v) => [coinId(v), COIN_WEIGHTS[v]])),
        [COLLECTOR]: 8,
        [EMPTY]: 60,
      })
      .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 320 + (col + row) * 60 })
      .ticker(app.ticker)
      .build();
    mini.x = startX + col * (CELL + GAP);
    mini.y = startY + row * (CELL + GAP);
    app.stage.addChild(mini);
    cells.push({ col, row, reelSet: mini });
  }
}

// ── Total + collector stamp ─────────────────────────────────────────────
// Value coins display their coefficient on the face. only the collector
// needs an overlay (the absorbed total is computed at runtime, not from
// the strip), so the badge map only ever holds collector entries.
const collectorBadges = new Map();
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

function drawCollectorBadge(cell, total) {
  const key = `${cell.col},${cell.row}`;
  const existing = collectorBadges.get(key);
  if (existing) { try { existing.destroy(); } catch {} }
  const badge = new PIXI.Text({
    text: String(total),
    style: {
      fontFamily:
        '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", "Liberation Sans Narrow", system-ui, sans-serif',
      fontSize: Math.floor(CELL * 0.3),
      fontWeight: '900',
      fill: 0xbfffbf,
      stroke: { color: 0x000000, width: 3 },
      align: 'center',
    },
  });
  badge.anchor.set(0.5);
  badge.x = cell.reelSet.x + CELL / 2;
  badge.y = cell.reelSet.y + CELL / 2;
  app.stage.addChild(badge);
  collectorBadges.set(key, badge);
}

function clearCollectorBadge(col, row) {
  const key = `${col},${row}`;
  const badge = collectorBadges.get(key);
  if (badge) { try { badge.destroy(); } catch {} collectorBadges.delete(key); }
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
    if (pin.symbolId === COLLECTOR && typeof pin.payload?.value === 'number') {
      drawCollectorBadge(cell, pin.payload.value);
    }
    recomputeTotal();
  });
  cell.reelSet.events.on('pin:expired', (pin) => {
    if (pin?.symbolId === COLLECTOR) clearCollectorBadge(cell.col, cell.row);
    recomputeTotal();
  });
}

// ── Scripted demo: seed coins (varied values), then drop a collector ───
const rounds = [
  { hits: [
    { col: 1, row: 1, type: 'coin', value: 5 },
    { col: 2, row: 2, type: 'coin', value: 10 },
    { col: 3, row: 1, type: 'coin', value: 20 },
  ] },
  { hits: [
    { col: 2, row: 0, type: 'coin', value: 50 },
  ] },
  { hits: [
    { col: 2, row: 1, type: 'collector' },
  ] },
];

return {
  cleanup: () => {
    for (const b of collectorBadges.values()) try { b.destroy(); } catch {}
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
        let target = EMPTY;
        if (hit?.type === 'coin') target = coinId(hit.value);
        else if (hit?.type === 'collector') target = COLLECTOR;
        cell.reelSet.setResult([{ visible: [target] }]);
      }
      await Promise.all(spinPromises);

      for (const cell of activeCells) {
        const hit = round.hits.find((h) => h.col === cell.col && h.row === cell.row);
        if (!hit) continue;

        if (hit.type === 'coin') {
          cell.reelSet.pin(0, 0, coinId(hit.value), {
            turns: 'permanent',
            payload: { value: hit.value },
          });
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
            if (isCoinId(nPin?.symbolId) && typeof nPin.payload?.value === 'number') {
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
