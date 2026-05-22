// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CoinSymbol, coinMultiplier,
//                   PIXI, gsap, app, pickWeighted, EmptySymbol
//
// Hold & Win with CellPin.
//
// Each grid cell is its own 1×1 ReelSet. The strip rolls a typical H&W coef
// ladder. x2 / x5 / x10 / x20 / x50 of bet. Each rung is its OWN CoinSymbol
// variant, so the player sees the value-bearing coins flash past during the
// spin (not a blank gold coin that "becomes" valuable on stop).
//
// On land the engine pins the rolled coin with `turns: 'permanent'` and a
// payload carrying the numeric coefficient. Pinned cells skip their spin
// on subsequent rounds; the symbolId encodes the visual, the payload
// encodes the game-side number, no value badge is needed on top.

const EMPTY = 'empty';
const COLS = 5, ROWS = 3, CELL = 60, GAP = 4;

// Typical H&W coefficient ladder. Tilted heavy at the bottom. x2 / x5 are
// common, x50 is rare. EMPTY weight keeps the overall coin-land rate at
// ~25% per cell per spin (sum of coin weights = 25, vs EMPTY = 75).
const LADDER = [2, 5, 10, 20, 50];
const COIN_WEIGHTS = { 2: 12, 5: 6, 10: 4, 20: 2, 50: 1 };
const idFor = (v) => `coin_x${v}`;

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
          r.register(idFor(v), CoinSymbol, coinMultiplier(v));
        }
        r.register(EMPTY, EmptySymbol, {});
      })
      .weights({
        ...Object.fromEntries(LADDER.map((v) => [idFor(v), COIN_WEIGHTS[v]])),
        [EMPTY]: 75,
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

// ── Running total ───────────────────────────────────────────────────────
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

function recomputeTotal() {
  let total = 0;
  for (const cell of cells) {
    const pin = cell.reelSet.getPin(0, 0);
    if (typeof pin?.payload?.value === 'number') total += pin.payload.value;
  }
  totalText.text = `TOTAL: ${total}`;
}

for (const cell of cells) {
  cell.reelSet.events.on('pin:placed', recomputeTotal);
  cell.reelSet.events.on('pin:expired', recomputeTotal);
}

// ── Scripted round sequence ─────────────────────────────────────────────
// Every ladder rung shows up at least once across the 3 rounds so the demo
// covers the full variant range. Order is low→high so the running total
// climbs visibly.
const rounds = [
  [
    { col: 0, row: 2, value: 2 },
    { col: 2, row: 0, value: 5 },
    { col: 4, row: 1, value: 10 },
  ],
  [{ col: 1, row: 0, value: 20 }],
  [{ col: 3, row: 2, value: 50 }],
];

return {
  cleanup: () => {
    try { totalText.destroy(); } catch {}
    for (const c of cells) try { c.reelSet.destroy(); } catch {}
  },
  onSpin: async () => {
    // Reset state at the start of every demo cycle.
    for (const cell of cells) {
      const pin = cell.reelSet.getPin(0, 0);
      if (pin) cell.reelSet.unpin(0, 0);
    }

    for (const hits of rounds) {
      const spinPromises = [];
      const activeCells = [];
      for (const cell of cells) {
        // Pinned (= already held) cells skip their spin entirely.
        if (cell.reelSet.getPin(0, 0)) continue;
        activeCells.push(cell);
        spinPromises.push(cell.reelSet.spin());
      }

      await new Promise((r) => setTimeout(r, 140));
      for (const cell of activeCells) {
        const hit = hits.find((h) => h.col === cell.col && h.row === cell.row);
        cell.reelSet.setResult([{ visible: [hit ? idFor(hit.value) : EMPTY] }]);
      }
      await Promise.all(spinPromises);

      // Pin every hit using its variant id; payload carries the coefficient
      // for game-layer total / payout calculation.
      for (const cell of activeCells) {
        const hit = hits.find((h) => h.col === cell.col && h.row === cell.row);
        if (!hit) continue;
        cell.reelSet.pin(0, 0, idFor(hit.value), {
          turns: 'permanent',
          payload: { value: hit.value },
        });
      }

      await new Promise((r) => setTimeout(r, 650));
    }
  },
};
