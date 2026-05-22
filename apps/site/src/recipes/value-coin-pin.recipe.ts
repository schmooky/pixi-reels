// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CoinSymbol, drawCoin,
//                   PIXI, gsap, app, pickWeighted, EmptySymbol
//
// Hold & Win with CellPin.
//
// Each grid cell is its own 1×1 ReelSet. Gold coins flash past during the
// spin. When a coin lands, we pin it on its mini-reel with `turns: 'permanent'`
// and a payload carrying the coin value. The value is stamped on the coin's
// face. Pinned cells skip their spin on subsequent rounds. the engine keeps
// showing the coin, its payload is readable from `reelSet.pins`, and the
// running total updates live.

const COIN = 'coin';
const EMPTY = 'empty';
const COLS = 5, ROWS = 3, CELL = 60, GAP = 4;
const COIN_VALUES = [10, 25, 50, 100];

// Blank gold coin. value is added as a stamp on land (pin payload).
const BLANK_COIN = { rimColor: 0xb8860b, faceColor: 0xf5d066 };

// Build 15 independent 1×1 ReelSets. one per cell.
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
        r.register(COIN, CoinSymbol, BLANK_COIN);
        r.register(EMPTY, EmptySymbol, {});
      })
      .weights({ [COIN]: 1, [EMPTY]: 3 })
      .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 320 + (col + row) * 60 })
      .ticker(app.ticker)
      .build();
    mini.x = startX + col * (CELL + GAP);
    mini.y = startY + row * (CELL + GAP);
    app.stage.addChild(mini);
    cells.push({ col, row, reelSet: mini });
  }
}

// ── Total display ───────────────────────────────────────────────────────
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

// ── Value stamps on pinned coins ────────────────────────────────────────
// Subscribe to every mini-reel's pin events; draw the payload.value as the
// coin's "stamp". darker color than a floating badge — reads as embossed.
const badges = new Map();
function badgeKey(col, row) { return `${col},${row}`; }

function drawBadge(cell, value) {
  const key = badgeKey(cell.col, cell.row);
  const existing = badges.get(key);
  if (existing) { try { existing.destroy(); } catch {} }
  const badge = new PIXI.Text({
    text: String(value),
    style: {
      fontFamily:
        '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", "Liberation Sans Narrow", system-ui, sans-serif',
      fontSize: Math.floor(CELL * 0.32),
      fontWeight: '900',
      fill: 0x3a2900,
      align: 'center',
    },
  });
  badge.anchor.set(0.5);
  badge.x = cell.reelSet.x + CELL / 2;
  badge.y = cell.reelSet.y + CELL / 2;
  app.stage.addChild(badge);
  badges.set(key, badge);
}

function clearBadge(col, row) {
  const key = badgeKey(col, row);
  const badge = badges.get(key);
  if (badge) { try { badge.destroy(); } catch {} badges.delete(key); }
}

function recomputeTotal() {
  let total = 0;
  for (const cell of cells) {
    const pin = cell.reelSet.getPin(0, 0);
    if (typeof pin?.payload?.value === 'number') total += pin.payload.value;
  }
  totalText.text = `TOTAL: ${total}`;
}

// Hook pin events on every mini reel
for (const cell of cells) {
  cell.reelSet.events.on('pin:placed', (pin) => {
    if (typeof pin.payload?.value === 'number') {
      drawBadge(cell, pin.payload.value);
      recomputeTotal();
    }
  });
  cell.reelSet.events.on('pin:expired', () => {
    clearBadge(cell.col, cell.row);
    recomputeTotal();
  });
}

// ── Scripted round sequence ─────────────────────────────────────────────
const rounds = [
  [{ col: 0, row: 2 }, { col: 2, row: 0 }, { col: 4, row: 1 }],
  [{ col: 1, row: 0 }],
  [{ col: 3, row: 2 }],
];

return {
  cleanup: () => {
    for (const b of badges.values()) try { b.destroy(); } catch {}
    try { totalText.destroy(); } catch {}
    for (const c of cells) try { c.reelSet.destroy(); } catch {}
  },
  onSpin: async () => {
    // Reset state at the start of every demo cycle
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
        const isHit = hits.some((h) => h.col === cell.col && h.row === cell.row);
        cell.reelSet.setResult([{ visible: [isHit ? COIN : EMPTY] }]);
      }
      await Promise.all(spinPromises);

      // Pin every hit with its value payload. the engine keeps the coin
      // visible for the rest of the feature.
      for (const cell of activeCells) {
        if (!hits.some((h) => h.col === cell.col && h.row === cell.row)) continue;
        const value = COIN_VALUES[Math.floor(Math.random() * COIN_VALUES.length)];
        cell.reelSet.pin(0, 0, COIN, { turns: 'permanent', payload: { value } });
      }

      await new Promise((r) => setTimeout(r, 650));
    }
  },
};
