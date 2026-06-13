// @ts-nocheck
// Injected: HoldAndWinBuilder, CoinSymbol, COIN_TRIGGER, PIXI, app

const COIN = 'coin';
const COLS = 5, ROWS = 3, CELL = 60, GAP = 4;

// One builder call replaces the hand-rolled per-cell ReelSet loop: the board
// owns the 15 independent 1x1 reels, the lock bookkeeping, the landing wave,
// and the respin counter. Coins are opaque to it. `id` picks the registered
// art, `data` (unused here) carries whatever the game layer wants.
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols(r => r.register(COIN, CoinSymbol, COIN_TRIGGER))
  // Mostly empty so coins flash past during the spin animation. `empty` is
  // auto-registered by the board.
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .ticker(app.ticker)
  .build();

const boardW = COLS * (CELL + GAP) - GAP;
const boardH = ROWS * (CELL + GAP) - GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 12;
app.stage.addChild(board.container);

// The HUD never tracks state itself. board events are the single source.
const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x8a7d66 },
});
hud.anchor.set(0.5, 0);
hud.x = app.screen.width / 2;
hud.y = board.container.y + boardH + 12;
app.stage.addChild(hud);

const refreshHud = () => {
  hud.text = `respins ${board.respinsLeft} · held ${board.lockedCoins.length}/${board.capacity}`;
};
board.events.on('respins:changed', refreshHud);
board.events.on('coin:locked', refreshHud);
board.events.on('board:full', () => { hud.text = 'GRAND · board full'; });
board.events.on('feature:end', ({ full }) => {
  if (!full) hud.text = `over · ${board.lockedCoins.length} coins held`;
});

// Scripted arrivals: 3 coins in round 1, 1 in round 2, 1 in round 3. In a
// real game the server decides each round's hits and the loop runs until
// `result.done`.
const rounds = [
  [{ col: 0, row: 2 }, { col: 2, row: 0 }, { col: 4, row: 1 }],
  [{ col: 1, row: 0 }],
  [{ col: 3, row: 2 }],
];

return {
  cleanup: () => board.destroy(),
  onSpin: async () => {
    board.reset();
    board.enter([]);
    for (const hits of rounds) {
      await board.respin(hits.map(cell => ({ cell, id: COIN })));
      await new Promise(r => setTimeout(r, 650));
    }
  },
};
