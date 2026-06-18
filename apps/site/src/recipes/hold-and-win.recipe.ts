// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, PIXI, gsap, app
//
// Hold & Win starter — the minimal HoldAndWinBuilder board: grid, coin
// symbol, strip weights, respin count. The coin is the production-style
// Spine gold coin (GoldCoinSymbol), the same one the other H&W recipes use.
// The board owns the 15 independent 1x1 reels, the lock bookkeeping, the
// landing wave and the respin counter; coins stay opaque to it.

const COIN = 'coin';
const COLS = 5, ROWS = 3, CELL = 64, GAP = 6;
const fmt = (v) => v.toFixed(2);

// the shared Spine coin set (gold lightning coin + bitmap value font)
const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-jackpot': '/hw-spine/jackpot.json',
};
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));

const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' } };
const SETTLE_SIZE = CELL - 8;
const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
probe.state.setAnimation(0, 'mini_x', true);
try { probe.update(0); } catch {}
const pb = probe.getLocalBounds();
const scale = (CELL - 6) / Math.max(1, pb.width, pb.height);
probe.destroy();

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  // The coin is a Spine symbol now — one registration, no custom class.
  .symbols((r) => r.register(COIN, GoldCoinSymbol, {
    spineMap: SPINE_MAP, idleAnimation: 'idle', scale, settleSize: SETTLE_SIZE,
  }))
  // Mostly empty so coins flash past during the spin animation. `empty` is
  // auto-registered by the board.
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .cellChrome((g, size) => {
    g.roundRect(0, 0, size, size, 10)
      .fill({ color: 0xfaf6ef, alpha: 0.6 })
      .stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * (CELL + GAP) - GAP;
const boardH = ROWS * (CELL + GAP) - GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 12;
app.stage.addChild(board.container);

// value labels in the game's gold bitmap font, painted from the coin payload
const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const paintLabel = (cell, value) => {
  const c = board.cellCenter(cell);
  const t = new PIXI.BitmapText({ text: fmt(value), style: { fontFamily: 'GoldDigits', fontSize: 22 } });
  t.anchor.set(0.5);
  if (t.width > CELL * 0.8) t.scale.set((CELL * 0.8) / t.width);
  t.position.set(board.container.x + c.x, board.container.y + c.y);
  labels.addChild(t);
  labelAt.set(`${cell.col},${cell.row}`, t);
};

// The HUD never tracks state itself. board events are the single source.
const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x8a7d66 },
});
hud.anchor.set(0.5, 0);
hud.x = app.screen.width / 2;
hud.y = board.container.y + boardH + 12;
app.stage.addChild(hud);

const refreshHud = () => { hud.text = `respins ${board.respinsLeft} · held ${board.lockedCoins.length}/${board.capacity}`; };
board.events.on('respins:changed', refreshHud);
board.events.on('coin:locked', ({ coin }) => { paintLabel(coin.cell, coin.data?.value ?? 0); refreshHud(); });
board.events.on('board:full', () => { hud.text = 'GRAND · board full'; });
board.events.on('feature:end', ({ full }) => { if (!full) hud.text = `over · ${board.lockedCoins.length} coins held`; });

// Scripted arrivals: 3 coins in round 1, 1 in round 2, 1 in round 3. In a
// real game the server decides each round's hits and the loop runs until
// `result.done`.
const val = () => [5, 10, 15, 25, 50][Math.floor(Math.random() * 5)];
const rounds = [
  [{ col: 0, row: 2 }, { col: 2, row: 0 }, { col: 4, row: 1 }],
  [{ col: 1, row: 0 }],
  [{ col: 3, row: 2 }],
];

return {
  cleanup: () => { for (const t of labelAt.values()) { try { t.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    for (const t of labelAt.values()) t.destroy();
    labelAt.clear();
    board.reset();
    board.enter([]);
    for (const hits of rounds) {
      await board.respin(hits.map((cell) => ({ cell, id: COIN, data: { value: val() } })));
      await new Promise((r) => setTimeout(r, 650));
    }
  },
};
