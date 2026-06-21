// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, SpineReelSymbol, Spine, bezierFly, fitText, PIXI, gsap, app
//
// Collector coin on a Hold & Win board.
//
// Built on `HoldAndWinBuilder` — no pins, no hand-rolled grid. Value coins
// carry their amount in `coin.data`; when the collector orb locks, the game
// layer walks `board.lockedCoins`, sums the orb's neighbours, flies their
// values in and `release()`s those cells. The collector's badge shows the
// absorbed total.

const COIN = 'coin', COLLECTOR = 'collector', COLS = 5, ROWS = 3, CELL = 64, GAP = 6;
const ck = (c) => `${c.col},${c.row}`;

const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-goldfont': '/hw-spine/goldfont.fnt', 'hw-jackpot': '/hw-spine/jackpot.json', 'hw-collector': '/hw-spine/collector.json' };
for (const [alias, src] of Object.entries(ASSETS)) { if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} } }
await PIXI.Assets.load(Object.keys(ASSETS));
const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' }, [COLLECTOR]: { skeleton: 'hw-collector', atlas: 'hw-atlas' } };
const probeScale = (skeleton, pose, pad) => { const s = Spine.from({ skeleton, atlas: 'hw-atlas' }); if (s.skeleton.data.findAnimation(pose)) s.state.setAnimation(0, pose, true); try { s.update(0); } catch {} const b = s.getLocalBounds(); const sc = (CELL + pad) / Math.max(1, b.width, b.height); s.destroy(); return sc; };
const COIN_SCALE = probeScale('hw-jackpot', 'mini_x', -6);
const ORB_SCALE = probeScale('hw-collector', 'idle_counter', 6);

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    r.register(COIN, GoldCoinSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle', scale: COIN_SCALE, settleSize: CELL - 8 });
    r.register(COLLECTOR, SpineReelSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle_counter', winAnimation: 'win', landingAnimation: 'fall', autoPlayLanding: true, scale: ORB_SCALE });
  })
  .weights({ [COIN]: 1, empty: 3, [COLLECTOR]: 0 }) // collector is server-placed
  .symbolData({ [COLLECTOR]: { unmask: true } })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0xfaf6ef, alpha: 0.6 }).stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP, boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 14;
app.stage.addChild(board.container);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const goldText = (text, size) => { const t = new PIXI.BitmapText({ text, style: { fontFamily: 'GoldDigits', fontSize: size } }); t.anchor.set(0.5); return t; };
const paintValue = (cell, value) => {
  labelAt.get(ck(cell))?.destroy();
  const p = abs(cell);
  const t = fitText(goldText(String(value), 30), CELL * 0.82, CELL * 0.46);
  t.position.set(p.x, p.y);
  labels.addChild(t); labelAt.set(ck(cell), t);
  return t;
};

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0); hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const SEED = [
  { cell: { col: 1, row: 1 }, id: COIN, data: { value: 5 } },
  { cell: { col: 3, row: 1 }, id: COIN, data: { value: 20 } },
  { cell: { col: 2, row: 0 }, id: COIN, data: { value: 10 } },
  { cell: { col: 2, row: 2 }, id: COIN, data: { value: 50 } },
];
const COLLECTOR_CELL = { col: 2, row: 1 }; // orthogonally adjacent to all four seeds
const seedBoard = () => { board.enter(SEED); for (const c of SEED) paintValue(c.cell, c.data.value); hud.text = 'press spin · the collector sweeps its neighbours'; };
seedBoard();

const flyers = new Set();
async function absorb(collectorCell) {
  const target = abs(collectorCell);
  const sumText = paintValue(collectorCell, 0); // the orb's running total
  const neighbours = [{ col: collectorCell.col - 1, row: collectorCell.row }, { col: collectorCell.col + 1, row: collectorCell.row }, { col: collectorCell.col, row: collectorCell.row - 1 }, { col: collectorCell.col, row: collectorCell.row + 1 }];
  let sum = 0;
  for (const n of neighbours) {
    const coin = board.lockedCoins.find((c) => c.id === COIN && ck(c.cell) === ck(n));
    if (!coin) continue;
    const from = abs(coin.cell);
    const clone = fitText(goldText(String(coin.data.value), 30), CELL * 0.82, CELL * 0.46);
    clone.position.set(from.x, from.y);
    app.stage.addChild(clone); flyers.add(clone);
    labelAt.get(ck(coin.cell))?.destroy(); labelAt.delete(ck(coin.cell));
    board.release([coin.cell]); // the neighbour clears; its value flies in
    await bezierFly(clone, from, target, { lean: 'up', curvature: 0.35, arriveScale: 0.3, duration: 0.45 });
    try { clone.destroy(); } catch {} flyers.delete(clone);
    sum += coin.data.value;
    sumText.text = String(sum);
    fitText(sumText, CELL * 0.82, CELL * 0.46);
  }
  void board.symbolAt(collectorCell).playWin?.(); // once, after absorbing — per-neighbour restarts would never let 'win' finish
  return sum;
}

let phase = 'ready';
return {
  cleanup: () => { for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} } for (const t of labelAt.values()) { try { t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (phase === 'running') return;
    if (phase === 'done') { for (const t of labelAt.values()) t.destroy(); labelAt.clear(); board.reset(); seedBoard(); phase = 'ready'; return; }
    phase = 'running';
    hud.text = 'collector landing…';
    await board.respin([{ cell: COLLECTOR_CELL, id: COLLECTOR, data: { collector: true } }]);
    await new Promise((r) => setTimeout(r, 300));
    hud.text = 'absorbing neighbours…';
    const sum = await absorb(COLLECTOR_CELL);
    hud.text = `collector absorbed ${sum} · press spin to reset`;
    phase = 'done';
  },
};
