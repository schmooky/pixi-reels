// @ts-nocheck
// Injected: HoldAndWinBuilder, SpeedPresets, CoinSymbol, coinValue,
//           PIXI, app, pickWeighted
//
// A Hold & Win round whose free cells roll UPWARD.
//
// `.axis('vertical', 'reverse')` is the only line that makes this a roll-up.
// The axis is per-cell travel, never layout: each cell is its own 1x1 ReelSet,
// so reversing the direction flips which edge a coin enters from and touches
// nothing else - `cols` x `rows`, the lock and the counter are unchanged.
//
// The hold is the other half of the mechanic, and it needs no option at all.
// `respin()` spins `board.freeCells` and only those: a locked cell never
// starts, never stops, and keeps its coin. `respin:start` reports exactly
// which cells are in flight, which is what the SPINNING readout counts.
//
// Gotcha: the ReelSet-level equivalent is `spin({ holdReels })`, and it holds
// a whole REEL. Hold & Win holds single cells, so a board has no `holdReels`
// - it holds at cell granularity instead, and that is the point.

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
  .axis('vertical', 'reverse') // <- free cells roll up between waves
  .symbols((r) => {
    for (const coin of COINS) r.register(coin.id, CoinSymbol, coinValue(coin.value));
  })
  .weights({ empty: 8, ...COIN_WEIGHTS })
  .respins(3)
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

// A gold frame on every locked cell, painted from `cellBounds` - board-local
// coordinates, so it rides along inside the board container.
const locks = new PIXI.Graphics();
board.container.addChild(locks);
const redrawLocks = () => {
  locks.clear();
  for (const c of board.lockedCoins) {
    const b = board.cellBounds(c.cell);
    locks.roundRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2, 8)
      .stroke({ width: 3, color: 0xffd43b, alpha: 0.9 });
  }
};
board.events.on('coin:locked', redrawLocks);
board.events.on('feature:enter', redrawLocks);
board.events.on('feature:reset', redrawLocks);

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xf5d066 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 14);
app.stage.addChild(hud);

const total = () => board.lockedCoins.reduce((sum, c) => sum + (c.data?.value ?? 0), 0);
let spinning = 0;
const paint = () => {
  hud.text =
    `RESPINS ${board.respinsLeft}   LOCKED ${board.lockedCoins.length}/${board.capacity}` +
    `   TOTAL ${total()}   SPINNING ${spinning}`;
};
// The wave's in-flight set, straight off the board - locked cells are absent.
board.events.on('respin:start', (e) => { spinning = e.spinning.length; paint(); });
board.events.on('respins:changed', paint);
board.events.on('coin:locked', paint);

// The server decides the trigger and each wave's hits; this stands in for it.
const coin = (cell) => {
  const id = pickWeighted(COIN_WEIGHTS);
  return { cell, id, data: { value: valueOf(id) } };
};
// A full column of coins on the trigger, so several cells are held out of
// every wave that follows.
const TRIGGER_CELLS = [
  { reel: 1, cell: 0 },
  { reel: 1, cell: 1 },
  { reel: 1, cell: 2 },
  { reel: 3, cell: 1 },
];
const rollHits = () => {
  const free = board.freeCells;
  if (free.length === 0 || Math.random() >= 0.55) return [];
  return [coin(free[Math.floor(Math.random() * free.length)])];
};

let busy = false;
return {
  cleanup: () => {
    try { hud.destroy(); } catch {}
    try { locks.destroy(); } catch {}
    board.destroy();
  },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    try {
      board.reset();
      spinning = 0;
      board.enter(TRIGGER_CELLS.map(coin));
      paint();
      for (let wave = 0; wave < MAX_WAVES; wave++) {
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
