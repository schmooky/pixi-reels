// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSpineSymbol, cloverGridBackground, loadHwCloverSpines,
//           CLOVER_SPEED, cloverCellMask, CLOVER_CELL, PIXI, gsap, app
//
// TWO CHANNELS TO PUSH A BOARD BACK. `board.dim()` lays a rectangle over each
// cell: the clover goes dark AND so does the cell it sits in, gaps and tile
// and all. `board.dimSymbols()` multiplies each symbol's own tint towards
// black instead: the art sinks, the board keeps its lights on.
//
// Same sweep runs twice here, so the only difference on screen is which
// channel did the dimming. `amount` is the strength on both, and both fade in
// and out over `fade` off the board's own ticker.
//
// The reason this is a library method rather than three lines of `gsap.to`:
// a dimmed cell that swaps its symbol has to keep its dim, and the symbol
// that LEFT has to lose the tint before the pool hands it to another cell.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
const SCALE = CELL.width / CLOVER_CELL.width;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const VALUES = [1, 1.5, 2, 2.5, 3, 5];

const art = await loadHwCloverSpines();
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'super', 'capsule'].map((id) => [id, { unmask: true }]));

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => { for (const id of ['gold', 'collect', 'multi', 'super', 'empty']) r.register(id, CloverSpineSymbol, { scale: SCALE }); })
  .weights({ gold: 3, collect: 0.5, multi: 0.4, super: 0.4, empty: 5 })
  .symbolData(UNMASK)
  .speedProfile(CLOVER_SPEED)
  .cellMask(cloverCellMask)
  .cellZIndex(({ cell, cols }) => cell.cell * cols + cell.reel)
  .respins(3)
  .lockAnimation('landing')
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid);
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);

board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin?.id === 'gold') board.symbolAt(cell).setLabel(fmt(coin.data.value));
});

const gold = (cell, value = pick(VALUES)) => ({ cell, id: 'gold', data: { value } });
const HERO = { reel: 2, cell: 1 };
const OTHERS = [
  { reel: 0, cell: 0 }, { reel: 1, cell: 2 }, { reel: 3, cell: 0 },
  { reel: 4, cell: 1 }, { reel: 1, cell: 0 },
];
const SEED = [gold(HERO, 25), ...OTHERS.map((c) => gold(c))];

/**
 * Hold the hero out on its own for a beat, pushing the rest back through
 * `which` channel. Both releases live here, so the board comes back however
 * the beat ends.
 */
async function spotlight(which) {
  const undim = which === 'cells'
    ? board.dim({ except: [HERO], amount: 0.7, fade: 240 })
    : board.dimSymbols({ except: [HERO], amount: 0.7, fade: 240 });
  const drop = board.lift(HERO);
  try {
    hud.text = which === 'cells'
      ? 'dim(): the cells go back too - tiles, gaps, the lot'
      : 'dimSymbols(): only the art goes back - the board keeps its lights on';
    for (let i = 0; i < 3; i++) {
      board.symbolAt(HERO).playWin();
      await sleep(560);
    }
  } finally {
    drop();
    undim();
  }
  board.symbolAt(HERO).playIdle();
}

let busy = false;
return {
  board,
  cleanup: () => { try { hud.destroy(); } catch {} grid.destroy({ children: true }); board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) { const s = board.symbolAt(c.cell); s.setLabel(fmt(c.data.value)); s.playIdle(); }
    hud.text = 'at rest - the same sweep runs twice, on two different channels';
    await sleep(900);

    await spotlight('cells');
    await sleep(700);
    await spotlight('symbols');

    hud.text = 'both released - press spin to compare again';
    busy = false;
  },
};
