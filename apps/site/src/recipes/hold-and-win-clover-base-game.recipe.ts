// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, HoldAndWinBuilder, CloverSymbol,
//           loadHwClover, CLOVER_FRUITS, CLOVER_FEATURES, PIXI, gsap, app
//
// The base game of a clover Hold & Win slot, on rectangular cells. Fruits and
// clovers share the strips: a GOLD clover is money and spins past with a
// bet-scaled amount on its face; the feature clovers (collect, multi,
// mystery, super) carry no amount. Three or more clovers on the stop hand
// their cells to the Hold & Win board, which respins around them.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
const BET = 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
const CLOVERS = ['gold', ...CLOVER_FEATURES, 'capsule'];

// A gold clover on the strip already shows an amount - a random one, scaled
// by the bet - so money reads as money while the reel is still moving. The
// landed value overwrites it the instant the reel settles (see spin:reelLanded).
class Clover extends CloverSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES) * BET));
  }
}

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
const ox = (app.screen.width - boardW) / 2;
const oy = (app.screen.height - boardH) / 2 - 8;

// -- base game: a normal reel set on the same rectangle as the board --
const base = new ReelSetBuilder()
  .reels(COLS).visibleCells(ROWS)
  .symbolSize(CELL.width, CELL.height).symbolGap(COLUMN_GAP, ROW_GAP)
  .symbols((r) => { for (const id of [...CLOVER_FRUITS, ...CLOVERS]) r.register(id, Clover, { art }); })
  .weights({
    ...Object.fromEntries(CLOVER_FRUITS.map((id) => [id, 3])),
    gold: 1.2, collect: 0.3, multi: 0.3, mystery: 0.3, super: 0.2, capsule: 0.2,
  })
  .symbolData(UNMASK)
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();
base.position.set(ox, oy);
// one framing for both: the base reels and the board share the geometry
const grid = cloverGridBackground({ x: ox, y: oy, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid, base);

// -- the Hold & Win board on the same geometry, hidden until it triggers --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => { for (const id of [...CLOVERS, 'empty']) r.register(id, Clover, { art }); })
  // in the feature only clovers spin past - the base game's fruit stays behind
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  .respins(3)
  .lockAnimation('landing')
  .ticker(app.ticker)
  .build();
board.container.position.set(ox, oy);
board.container.visible = false;
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin · 3+ clovers trigger the feature', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, oy + boardH + 24);
app.stage.addChild(hud);

// The served amount replaces the strip's random one on the very frame the
// reel lands - the label is on the symbol, so nothing has to be re-drawn.
let served = null; // per-spin: reel -> row -> value for gold cells
base.events.on('spin:reelLanded', (reelIndex) => {
  if (!served) return;
  for (let row = 0; row < ROWS; row++) {
    const s = base.reels[reelIndex].getSymbolAt(row);
    if (s.symbolId === 'gold') s.setLabel(fmt(served[reelIndex][row]));
  }
});
board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin && coin.id === 'gold') board.symbolAt(cell).setLabel(fmt(coin.data.value));
});

// scripted base results: a near miss (2 clovers), then a trigger (3 gold + a mystery)
const SPINS = [
  [{ reel: 1, cell: 1, id: 'gold' }, { reel: 3, cell: 0, id: 'multi' }],
  [{ reel: 0, cell: 2, id: 'gold' }, { reel: 2, cell: 0, id: 'gold' }, { reel: 3, cell: 1, id: 'mystery' }, { reel: 4, cell: 2, id: 'gold' }],
];
let spinNo = 0;

function baseResult(clovers) {
  const grid = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => pick(CLOVER_FRUITS)));
  served = Array.from({ length: COLS }, () => Array(ROWS).fill(0));
  for (const c of clovers) {
    grid[c.reel][c.cell] = c.id;
    if (c.id === 'gold') served[c.reel][c.cell] = pick(STRIP_VALUES) * BET;
  }
  return grid;
}

async function runFeature(clovers) {
  base.visible = false;
  board.container.visible = true;
  board.reset();
  // the trigger clovers carry over as the first locked cells; only gold has a value
  const seed = clovers.map((c) => ({ cell: { reel: c.reel, cell: c.cell }, id: c.id, data: { value: c.id === 'gold' ? served[c.reel][c.cell] : 0 } }));
  board.enter(seed);
  for (const c of seed) if (c.id === 'gold') board.symbolAt(c.cell).setLabel(fmt(c.data.value));
  hud.text = 'HOLD & WIN · gold carries money, feature clovers carry none';
  await sleep(500);
  for (const cells of [[{ reel: 1, cell: 0 }], [{ reel: 3, cell: 2 }, { reel: 0, cell: 0 }], [], [], []]) {
    const res = await board.respin(cells.map((cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) * BET } })));
    await sleep(400);
    if (res.done) break;
  }
  await board.playWin();
  const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
  hud.text = `feature over · won ${fmt(total)} · back to the base game`;
  await sleep(700);
  board.container.visible = false;
  base.visible = true;
}

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); grid.destroy({ children: true }); } catch {} board.destroy(); base.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    const clovers = SPINS[spinNo % SPINS.length];
    spinNo += 1;
    hud.text = 'spinning...';
    const p = base.spin();
    await sleep(150);
    base.setResult(baseResult(clovers).map((visible) => ({ visible })));
    await p;
    if (clovers.length >= 3) {
      hud.text = `${clovers.length} clovers - entering Hold & Win`;
      await sleep(600);
      await runFeature(clovers);
    } else {
      hud.text = `${clovers.length} clovers · need 3 · press spin`;
    }
    busy = false;
  },
};
