// @ts-nocheck
// Injected: HoldAndWinBuilder, SpeedPresets, CoinSymbol, coinValue,
//           PIXI, app, pickWeighted
//
// A Hold & Win round whose cells spin SIDEWAYS.
//
// `.axis('horizontal')` is the whole change. Every Hold & Win cell is its own
// 1x1 ReelSet, so the axis only picks which edge a coin scrolls in from: the
// board still lays out `cols` x `rows`, the lock still claims one cell, and
// the round choreography below is byte-for-byte the vertical one.
//
// Gotcha: do NOT build a sideways Hold & Win on a plain ReelSet with
// `.orientation('horizontal')`. There a reel IS a whole row, so the row
// travels as one continuous ribbon - coins straddle the gaps between cells,
// get clipped mid-glyph at the board edge, and slide right past the cells
// that are supposed to be locked. Hold & Win's atomic unit is the cell, which
// is exactly what `HoldAndWinBuilder` builds.

const COLS = 5, ROWS = 3, CELL = 66, GAP = 6;
const MAX_WAVES = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COINS = [
  { id: 'coin5', value: 5 },
  { id: 'coin10', value: 10 },
  { id: 'coin25', value: 25 },
  { id: 'coin50', value: 50 },
];
const COIN_WEIGHTS = { coin5: 10, coin10: 6, coin25: 3, coin50: 1 };
const valueOf = (id) => COINS.find((c) => c.id === id).value;

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .axis('horizontal') // <- the one line that turns the cells sideways
  .symbols((r) => {
    for (const coin of COINS) r.register(coin.id, CoinSymbol, coinValue(coin.value));
  })
  // Coins flash past empties while a cell spins. `empty` is auto-registered.
  .weights({ empty: 8, ...COIN_WEIGHTS })
  .respins(3)
  // Slow enough that the sideways travel reads before the cell lands.
  .speedProfile({ ...SpeedPresets.NORMAL, minimumSpinTime: 620 })
  .stagger((reel, cell) => (reel + cell) * 90)
  .cellChrome((g, size) => {
    g.roundRect(0, 0, size, size, 8)
      .fill({ color: 0x140f2e, alpha: 0.55 })
      .stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 14;
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xf5d066 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 14);
app.stage.addChild(hud);

// The HUD tracks nothing itself; board events are the single source.
const total = () => board.lockedCoins.reduce((sum, c) => sum + (c.data?.value ?? 0), 0);
const paint = () => {
  hud.text =
    `RESPINS ${board.respinsLeft}   LOCKED ${board.lockedCoins.length}/${board.capacity}` +
    `   TOTAL ${total()}`;
};
board.events.on('respins:changed', paint);
board.events.on('coin:locked', paint);

// The server decides the trigger and each wave's hits; this stands in for it.
const coin = (cell) => {
  const id = pickWeighted(COIN_WEIGHTS);
  return { cell, id, data: { value: valueOf(id) } };
};
const trigger = () => {
  const free = [...board.freeCells];
  return Array.from({ length: 3 }, () =>
    coin(free.splice(Math.floor(Math.random() * free.length), 1)[0]),
  );
};
const rollHits = () => {
  const free = board.freeCells;
  if (free.length === 0 || Math.random() >= 0.55) return [];
  return [coin(free[Math.floor(Math.random() * free.length)])];
};

let busy = false;
return {
  cleanup: () => {
    try { hud.destroy(); } catch {}
    board.destroy();
  },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    try {
      board.reset();
      board.enter(trigger()); // trigger coins land locked, instantly - no spin
      paint();
      for (let wave = 0; wave < MAX_WAVES; wave++) {
        // Only the free cells spin, each on its own strip.
        const result = await board.respin(rollHits());
        if (result.done) break;
        await sleep(320);
      }
      hud.text =
        `ROUND OVER   LOCKED ${board.lockedCoins.length}/${board.capacity}   TOTAL ${total()}`;
    } finally {
      busy = false;
    }
  },
};
