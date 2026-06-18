// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, fitText, pickWeighted, PIXI, gsap, app
//
// Value-carrying coins on a Hold & Win board.
//
// Each coin carries a coefficient (×2 … ×50) in `coin.data`. The board locks
// every hit and respins only the free cells natively — no pins, no
// hand-rolled grid of mini-reels, just `HoldAndWinBuilder`. The ×N badge is
// painted from the data; the running total is summed from `board.lockedCoins`.

const COIN = 'coin', COLS = 5, ROWS = 3, CELL = 64, GAP = 6;
// a typical coefficient ladder — ×2 common, ×50 rare; the server picks per hit
const LADDER_W = { 2: 12, 5: 6, 10: 4, 20: 2, 50: 1 };
const pickValue = () => Number(pickWeighted(LADDER_W));

const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-jackpot': '/hw-spine/jackpot.json' };
for (const [alias, src] of Object.entries(ASSETS)) { if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} } }
await PIXI.Assets.load(Object.keys(ASSETS));
await PIXI.Assets.load('/hw-sprites/hwfont-mult.fnt'); // the game's ×N multiplier bitmap font
const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' } };
const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
probe.state.setAnimation(0, 'mini_x', true);
try { probe.update(0); } catch {}
const pb = probe.getLocalBounds();
const COIN_SCALE = (CELL - 6) / Math.max(1, pb.width, pb.height);
probe.destroy();

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, GoldCoinSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle', scale: COIN_SCALE, settleSize: CELL - 8 }))
  .weights({ [COIN]: 1, empty: 3 }) // coins flash past empties on the strip
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0xfaf6ef, alpha: 0.6 }).stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP, boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 14;
app.stage.addChild(board.container);

// -- ×N badges (from coin.data) + running total (from board.lockedCoins) --
const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const badge = (cell, value) => {
  const k = `${cell.col},${cell.row}`; labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = fitText(new PIXI.BitmapText({ text: `${value}x`, style: { fontFamily: 'DiamondMult', fontSize: 48 } }), CELL * 0.8, CELL * 0.5);
  t.anchor.set(0.5); t.position.set(p.x, p.y);
  labels.addChild(t); labelAt.set(k, t);
};
const total = new PIXI.Text({ text: 'TOTAL: 0', style: { fontFamily: 'system-ui, sans-serif', fontSize: 22, fontWeight: '800', fill: 0xfef08a, stroke: { color: 0x000000, width: 4 } } });
total.anchor.set(0.5, 0); total.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(total);
const refreshTotal = () => { total.text = `TOTAL: ${board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0)}`; };

board.events.on('coin:locked', ({ coin }) => { badge(coin.cell, coin.data.value); refreshTotal(); });

// scripted rounds — low → high so the running total climbs; the server would
// decide each round's hit cells and coefficients in a real game
const ROUNDS = [
  [{ col: 0, row: 2 }, { col: 2, row: 0 }, { col: 4, row: 1 }],
  [{ col: 1, row: 0 }],
  [{ col: 3, row: 2 }],
  [],
];

let busy = false;
return {
  cleanup: () => { for (const t of labelAt.values()) { try { t.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    for (const t of labelAt.values()) t.destroy(); labelAt.clear();
    board.reset(); board.enter([]); refreshTotal();
    for (const cells of ROUNDS) {
      const res = await board.respin(cells.map((cell) => ({ cell, id: COIN, data: { value: pickValue() } })));
      await new Promise((r) => setTimeout(r, 650));
      if (res.done) break;
    }
    busy = false;
  },
};
