// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSpineSymbol, cloverGridBackground, loadHwCloverSpines,
//           CLOVER_SPEED, cloverCellMask, CLOVER_CELL, PIXI, gsap, app
//
// ONE CELL FORWARD, THE REST BACK. `board.dim({ except })` is the partner of
// `board.lift()`: the dim draws above every cell's clover and below anything
// lifted, so a lifted cell stays out in front of it whether or not it is
// excepted. Pair them and a collect reads as one beat - the collector out on
// its own, the board it is collecting from sunk behind.
//
// A dim covers CELLS, not symbol ids. This collect spares every gold clover
// it is about to sweep, so the money stays bright while the blanks go dark:
// the ids are resolved to cells at the call site, where the game knows them.

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
const COLLECTOR = { reel: 4, cell: 1 };
const GOLDS = [
  { reel: 0, cell: 1 }, { reel: 1, cell: 0 }, { reel: 1, cell: 2 },
  { reel: 2, cell: 1 }, { reel: 3, cell: 0 }, { reel: 3, cell: 2 },
];
const SEED = [...GOLDS.map((c) => gold(c)), { cell: COLLECTOR, id: 'collect', data: { value: 0 } }];

/**
 * Sweep every gold clover into the collector. The dim spares the collector
 * and the money it is about to take, so the pair reads as one beat; the lift
 * keeps the collector's own animation clear of its neighbours' art.
 */
async function collect() {
  // Both releases live in this function - `finally` puts the board back
  // however the sweep ends.
  const undim = board.dim({ except: [COLLECTOR, ...GOLDS], amount: 0.65 });
  const drop = board.lift(COLLECTOR);
  const collector = board.symbolAt(COLLECTOR);
  let total = 0;
  try {
    collector.playWin();
    await sleep(320);
    for (const cell of GOLDS) {
      const coin = board.lockedCoins.find((c) => c.cell.reel === cell.reel && c.cell.cell === cell.cell);
      total += coin?.data.value ?? 0;
      board.symbolAt(cell).playWin();
      collector.setLabel(fmt(total));
      hud.text = `collecting ${fmt(total)} - collector lifted, board dimmed except the money`;
      await sleep(240);
    }
    await sleep(300);
  } finally {
    drop();
    undim();
  }
  return total;
}

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} grid.destroy({ children: true }); board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) {
      const s = board.symbolAt(c.cell);
      if (c.id === 'gold') s.setLabel(fmt(c.data.value));
      s.playIdle();
    }
    hud.text = 'seven cells held - the collector is about to sweep';
    await sleep(700);

    const total = await collect();
    hud.text = `collected ${fmt(total)} - board back to its at-rest order`;
    busy = false;
  },
};
