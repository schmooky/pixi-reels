// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, cloverGridBackground, loadHwClover,
//           CLOVER_SPEEDS, cloverCellMask, PIXI, gsap, app
//
// One speed switch for the whole board. Every cell is its own 1x1 reel set
// with its own SpeedManager, so speeds are registered board-wide with
// speeds({ normal, turbo, superTurbo }) and switched board-wide with
// board.setSpeed(name) - the board's reelSet.setSpeed(). Same rule as a reel
// set: a cell already in flight finishes on the profile it started with, the
// next wave runs on the new one, and skip() is how a turbo press cuts the
// wave in progress. Three waves here: normal, turbo (switched mid-wave and
// slammed home), superTurbo.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const VALUES = [1, 1.5, 2, 2.5, 3, 5];

const art = await loadHwClover();
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
class Clover extends CloverSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick(VALUES))); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => { for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art }); })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  // every name lands in every cell's SpeedManager; 'normal' is active at build
  .speeds(CLOVER_SPEEDS)
  // the landing wave flattens as the speed goes up
  .stagger((reel, cell, speed) => (speed === 'superTurbo' ? 0 : speed === 'turbo' ? (reel + cell) * 25 : (reel + cell) * 70))
  .cellMask(cloverCellMask)
  .respins(3)
  .lockAnimation('landing')
  .ticker(app.ticker)
  .build();
const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid, board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);
const badge = new PIXI.Text({ text: 'normal', style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xf5b400 } });
badge.anchor.set(1, 0);
badge.position.set(board.container.x + boardW, board.container.y - 26);
app.stage.addChild(badge);
board.events.on('speed:changed', ({ name, previous }) => {
  badge.text = name;
  gsap.fromTo(badge.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
  hud.text = `setSpeed('${name}') from ${previous}: every cell's SpeedManager at once`;
});
board.events.on('cell:landed', ({ cell, coin }) => { if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value)); });

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick(VALUES) } });
const SEED = [{ reel: 1, cell: 1 }, { reel: 3, cell: 2 }].map(gold);

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); badge.destroy(); grid.destroy({ children: true }); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.setSpeed('normal');
    board.enter(SEED);
    for (const c of SEED) { const s = board.symbolAt(c.cell); s.setLabel(fmt(c.data.value)); s.playIdle(); }
    hud.text = 'wave 1 on normal';
    await sleep(400);

    // wave 1: normal
    await board.respin([gold({ reel: 0, cell: 0 })]);
    await sleep(400);

    // wave 2: switched to turbo WHILE the cells spin. They finish on normal
    // (the engine never retunes a reel in flight), so slam them - that is
    // what a turbo press does - and the wave after runs turbo end to end.
    const wave = board.respin([gold({ reel: 4, cell: 1 })]);
    await sleep(350);
    board.setSpeed('turbo');
    hud.text = "turbo mid-wave: cells finish on normal, skip() cuts them, next wave is turbo";
    await sleep(250);
    board.skip();
    await wave;
    await sleep(400);
    await board.respin([gold({ reel: 2, cell: 0 })]);
    await sleep(400);

    // wave 3: superTurbo, stagger 0 - the whole board lands as one
    board.setSpeed('superTurbo');
    await sleep(300);
    const res = await board.respin([gold({ reel: 2, cell: 2 })]);
    await sleep(300);
    if (!res.done) for (let i = 0; i < 3; i++) { const r = await board.respin([]); if (r.done) break; }
    await board.playWin();
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `feature over on ${board.speed} · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
