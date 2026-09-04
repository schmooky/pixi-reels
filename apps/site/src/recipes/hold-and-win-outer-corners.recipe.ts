// @ts-nocheck
// Injected: HoldAndWinBuilder, RoundedRectMaskStrategy, CloverSymbol, loadHwClover, CLOVER_SPEED, CLOVER_CELL, PIXI, gsap, app
//
// One rounded window, one mask per cell. Every Hold & Win cell is its own
// 1x1 reel set with its own mask, and `cellMask` takes a FUNCTION: it is
// called once per cell with the cell's column and row plus the board size,
// and returns that cell's strategy. Here each cell clips to a plain rect -
// except the four corner cells, each rounded on its single outer corner:
// top-left for (0, 0), top-right for (4, 0), and so on. With no gap between
// the cells the fifteen masks read as one rounded frame, cut on the same
// radius as the panel drawn behind the board.

const COLS = 5, ROWS = 3;
const CELL = { width: CLOVER_CELL.width / 2, height: CLOVER_CELL.height / 2 }; // 101 x 85
const RADIUS = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();

const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
class Clover extends CloverSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES)));
  }
}
// The clover glow is drawn past the cell: lift landed coins above their cell's
// mask (unmask), so only the strip in motion and the empty tiles are clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  // No gap: the cells butt together and the corner masks meet the panel edge.
  .cellSize(CELL, { gap: 0 })
  .symbols((r) => {
    for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art });
  })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  .speedProfile(CLOVER_SPEED)
  // One strategy per cell, decided from the cell's own column (`reel`) and
  // row (`cell`) and the board size: a plain rect everywhere, one rounded
  // corner on each of the four corner cells. `info.corners` carries this
  // exact object precomputed, so `(_, { corners }) => new
  // RoundedRectMaskStrategy({ radius, corners })` is the short form.
  .cellMask(({ reel, cell }, { cols, rows }) => new RoundedRectMaskStrategy({
    radius: RADIUS,
    corners: {
      topLeft: reel === 0 && cell === 0,
      topRight: reel === cols - 1 && cell === 0,
      bottomLeft: reel === 0 && cell === rows - 1,
      bottomRight: reel === cols - 1 && cell === rows - 1,
    },
  }))
  .respins(3)
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width;
const boardH = ROWS * CELL.height;
board.container.position.set(Math.round((app.screen.width - boardW) / 2), Math.round((app.screen.height - boardH) / 2 - 8));

// The frame: one rounded panel on the board's exact bounds, same radius as
// the corner masks, plus a soft glow just outside it.
const frame = new PIXI.Graphics();
const { x: bx, y: by } = board.container;
frame.roundRect(bx - 6, by - 6, boardW + 12, boardH + 12, RADIUS + 6).stroke({ color: 0x5fa0ff, width: 6, alpha: 0.25 });
frame.roundRect(bx, by, boardW, boardH, RADIUS).fill({ color: 0x0b1a4a }).stroke({ color: 0x5fa0ff, width: 2, alpha: 0.95 });
app.stage.addChild(frame);
app.stage.addChild(board.container);

// Trace every cell's own mask on top, faintly: fifteen rects, four of them
// with one rounded corner. This is the shape the engine clips each cell to.
const seams = new PIXI.Graphics();
for (let reel = 0; reel < COLS; reel++) {
  for (let cell = 0; cell < ROWS; cell++) {
    const b = board.cellBounds({ reel, cell });
    const r = (on) => (on ? RADIUS : 0);
    seams.roundShape([
      { x: b.x, y: b.y, radius: r(reel === 0 && cell === 0) },
      { x: b.x + b.width, y: b.y, radius: r(reel === COLS - 1 && cell === 0) },
      { x: b.x + b.width, y: b.y + b.height, radius: r(reel === COLS - 1 && cell === ROWS - 1) },
      { x: b.x, y: b.y + b.height, radius: r(reel === 0 && cell === ROWS - 1) },
    ], RADIUS).stroke({ color: 0x9cc8ff, width: 1, alpha: 0.35 });
  }
}
seams.position.copyFrom(board.container.position);
app.stage.addChild(seams);

const hud = new PIXI.Text({
  text: `gap 0 · radius ${RADIUS} · cellMask(({ reel, cell }, { cols, rows }) => strategy for that cell) · press spin`,
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);

board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value));
});

const SEED = [
  { cell: { reel: 0, cell: 0 }, id: 'gold', data: { value: 2 } },
  { cell: { reel: 4, cell: 2 }, id: 'gold', data: { value: 5 } },
];
const ROUNDS = [[{ reel: 2, cell: 1 }, { reel: 4, cell: 0 }], [{ reel: 0, cell: 2 }], [], [], []];

let busy = false;
return {
  cleanup: () => {
    try { hud.destroy(); } catch {}
    try { seams.destroy(); } catch {}
    try { frame.destroy(); } catch {}
    board.destroy();
  },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) { const sym = board.symbolAt(c.cell); sym.setLabel(fmt(c.data.value)); sym.playIdle(); }
    await sleep(350);
    for (const cells of ROUNDS) {
      const result = await board.respin(cells.map((cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) } })));
      await sleep(400);
      if (result.done) break;
    }
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
