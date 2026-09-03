// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, cloverGridBackground, loadHwClover, CLOVER_SPEED, CLOVER_CELL, PIXI, gsap, app
//
// Rectangular cells. Most Hold & Win art is wider than it is tall - this set
// is authored for 202x170 - so the board takes `{ width, height }` and a gap
// per axis: a seam between the columns, rows touching, like the source game.

const COLS = 5, ROWS = 3;
const CELL = { width: CLOVER_CELL.width / 2, height: CLOVER_CELL.height / 2 }; // 101 x 85
const COLUMN_GAP = 8, ROW_GAP = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();

// Gold is the money clover: on the strip it already wears a bet-scaled amount,
// a different one each time it flashes past, so money reads as money in
// motion. The served amount replaces it the frame the cell lands.
const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
class Clover extends CloverSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES)));
  }
}
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => {
    for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art });
  })
  // the bonus strip: only clovers and the capsule flash past, never base-game fruit
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  // a few px of bounce, not the tall-reel default: a clover cell should settle, not jump
  .speedProfile(CLOVER_SPEED)
  .respins(3)
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 8);
// the game's framing: gradient panel + grid lines in the gaps, behind a chrome-less board
const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid);
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: `cell ${CELL.width}x${CELL.height} · column gap ${COLUMN_GAP} · row gap ${ROW_GAP} · press spin`,
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);

// The value lives in coin.data; the symbol paints it the moment the cell lands.
board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value));
});
const b = board.cellBounds({ reel: 4, cell: 2 });
hud.text += `\nlast cell at (${b.x}, ${b.y}) ${b.width}x${b.height}`;

const SEED = [
  { cell: { reel: 0, cell: 1 }, id: 'gold', data: { value: 2 } },
  { cell: { reel: 3, cell: 0 }, id: 'gold', data: { value: 5 } },
];
const ROUNDS = [[{ reel: 2, cell: 2 }, { reel: 4, cell: 1 }], [{ reel: 1, cell: 0 }], [], [], []];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} grid.destroy({ children: true }); board.destroy(); },
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
