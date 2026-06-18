// @ts-nocheck
// Injected: HoldAndWinBuilder, ReelSymbol, PIXI, gsap, app
//
// BEGINNER LESSON — carry the value as DATA instead of baking it into the
// symbol class.
//
// In the previous lesson each value was its own symbol variant (coin5 always
// showed 5). That's fine when the values are fixed. But a real Hold & Win
// server sends a different amount for every coin, so we keep ONE generic coin
// symbol and attach the number as `data`:
//
//     board.respin([{ cell, id: 'coin', data: { value: 25 } }])
//
// The board never reads `data` — it just stores it. We paint the number
// ourselves from the `coin:locked` event. Same coin art, any value.

// The value label uses the game's gold digit bitmap font (crisp, centered).
await PIXI.Assets.load('/hw-spine/goldfont.fnt'); // font face: "GoldDigits"

// A plain coin: a gold disc with NO number on it. The number is added later
// as a separate label, driven by the coin's data.
class PlainCoin extends ReelSymbol {
  onActivate() { this._draw(); }
  onDeactivate() {}
  async playWin() {}
  stopAnimation() {}
  resize(w, h) { this._w = w; this._h = h; this._draw(); }
  _draw() {
    if (!this._w) return;
    this.view.removeChildren();
    const r = Math.min(this._w, this._h) / 2 - 4;
    this.view.addChild(
      new PIXI.Graphics().circle(this._w / 2, this._h / 2, r).fill(0xf6c945).stroke({ color: 0xb8860b, width: 3 }),
    );
  }
}

const COIN = 'coin';
const COLS = 3, ROWS = 2, CELL = 90, GAP = 8;
const fmt = (v) => v.toFixed(2);

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, PlainCoin, {})) // ONE generic coin, no value baked in
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0x191326, alpha: 0.6 }).stroke({ color: 0x5a4ea8, width: 1 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 12;
app.stage.addChild(board.container);

// The number lives in a separate label layer, NOT in the coin symbol.
const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();

// Paint the value from `coin.data.value`, positioned with the board's own
// cell geometry. This is the only place the value becomes visible.
const paintValue = (coin) => {
  const c = board.cellCenter(coin.cell); // board-local pixel center of the cell
  const t = new PIXI.BitmapText({ text: fmt(coin.data.value), style: { fontFamily: 'GoldDigits', fontSize: 30 } });
  t.anchor.set(0.5);
  if (t.width > CELL * 0.8) t.scale.set((CELL * 0.8) / t.width);
  t.position.set(board.container.x + c.x, board.container.y + c.y);
  labels.addChild(t);
  labelAt.set(`${coin.cell.col},${coin.cell.row}`, t);
};

board.events.on('coin:locked', ({ coin }) => paintValue(coin));

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const randVal = () => [2, 5, 10, 25, 50, 100][Math.floor(Math.random() * 6)];
const ROUNDS = [
  [{ col: 0, row: 0 }, { col: 2, row: 1 }],
  [{ col: 1, row: 0 }],
  [],
];

return {
  cleanup: () => { for (const t of labelAt.values()) { try { t.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    for (const t of labelAt.values()) t.destroy();
    labelAt.clear();
    board.reset();
    board.enter([]);
    for (const cells of ROUNDS) {
      // each hit carries its own value in `data` — different every coin
      await board.respin(cells.map((cell) => ({ cell, id: COIN, data: { value: randVal() } })));
      await new Promise((r) => setTimeout(r, 650));
    }
    const total = board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
    hud.text = `held ${board.lockedCoins.length} · total ${fmt(total)}`;
  },
};
