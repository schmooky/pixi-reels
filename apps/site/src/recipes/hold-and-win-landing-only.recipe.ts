// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, cloverGridBackground, loadHwClover, CLOVER_SPEED, CLOVER_CELL, PIXI, gsap, app
//
// Landing only. By default the board plays a coin's win animation the moment
// it locks; most productions want just a land beat there and one celebration
// once the board is decided. `lockAnimation('landing')` makes every lock play
// `playLanding()` (a settle) and nothing else; the game calls
// `board.playWin()` itself when the feature ends.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
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
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  // a few px of bounce, not the tall-reel default: a clover cell should settle, not jump
  .speedProfile(CLOVER_SPEED)
  .respins(3)
  // 'win' (default) | 'landing' | 'none'
  .lockAnimation('landing')
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
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);

let landed = 0;
board.events.on('cell:landed', ({ cell, coin }) => {
  if (!coin) return;
  landed += 1;
  board.symbolAt(cell).setLabel(fmt(coin.data.value));
  hud.text = `coin ${landed} landed · settle only, no win`;
});

const SEED = [
  { cell: { reel: 1, cell: 1 }, id: 'gold', data: { value: 3 } },
  { cell: { reel: 3, cell: 2 }, id: 'gold', data: { value: 1 } },
];
const ROUNDS = [[{ reel: 0, cell: 0 }, { reel: 4, cell: 0 }], [{ reel: 2, cell: 1 }], [{ reel: 4, cell: 2 }], [], [], []];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} grid.destroy({ children: true }); board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    landed = 0;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) { const sym = board.symbolAt(c.cell); sym.setLabel(fmt(c.data.value)); sym.playIdle(); }
    await sleep(350);
    for (const cells of ROUNDS) {
      const result = await board.respin(cells.map((cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) } })));
      await sleep(350);
      if (result.done) break;
    }
    // The one explicit celebration: every locked coin pulses together.
    hud.text = 'feature over · board.playWin() on every locked coin';
    await board.playWin();
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
