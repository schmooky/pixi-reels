// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, CLOVER_CELL, PIXI, gsap, app
//
// Rectangular cells. Most Hold & Win art is wider than it is tall - this set
// is authored for 202x170 - so the board takes `{ width, height }` and a gap
// per axis: a seam between the columns, rows touching, like the source game.

const COLS = 5, ROWS = 3;
const CELL = { width: CLOVER_CELL.width / 2, height: CLOVER_CELL.height / 2 }; // 101 x 85
const COLUMN_GAP = 6, ROW_GAP = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const art = await loadHwClover();

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => {
    for (const id of ['gold', 'cherry', 'lemon', 'plum', 'empty']) r.register(id, CloverSymbol, { art });
  })
  .weights({ gold: 2, cherry: 2, lemon: 2, plum: 2, empty: 5 })
  .respins(3)
  // The chrome gets the real cell rectangle, not one "size".
  .cellChrome((g, width, height) => {
    g.rect(0, 0, width, height).fill({ color: 0x0b1a4a, alpha: 0.9 }).stroke({ color: 0x3f6bd8, width: 1, alpha: 0.8 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 8);
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: `cell ${CELL.width}x${CELL.height} · column gap ${COLUMN_GAP} · row gap ${ROW_GAP} · press spin`,
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 10);
app.stage.addChild(hud);

// The value lives in coin.data; the symbol paints it the moment the cell lands.
board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value));
});
const b = board.cellBounds({ reel: 4, cell: 2 });
hud.text += `\nlast cell at (${b.x}, ${b.y}) ${b.width}x${b.height}`;

const VALUES = [1, 1, 2, 2.5, 3, 5, 7, 10];
const pick = () => VALUES[Math.floor(Math.random() * VALUES.length)];
const SEED = [
  { cell: { reel: 0, cell: 1 }, id: 'gold', data: { value: 2 } },
  { cell: { reel: 3, cell: 0 }, id: 'gold', data: { value: 5 } },
];
const ROUNDS = [[{ reel: 2, cell: 2 }, { reel: 4, cell: 1 }], [{ reel: 1, cell: 0 }], [], [], []];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) board.symbolAt(c.cell).setLabel(fmt(c.data.value));
    await sleep(350);
    for (const cells of ROUNDS) {
      const result = await board.respin(cells.map((cell) => ({ cell, id: 'gold', data: { value: pick() } })));
      await sleep(400);
      if (result.done) break;
    }
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
