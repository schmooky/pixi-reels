// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, cloverGridBackground, loadHwClover, CLOVER_SPEED, PIXI, gsap, app
//
// The bonus on its own: a 5x5 board of rectangular cells, nothing but the
// Hold & Win. Gold clovers spin past with bet-scaled amounts and lock where
// they land; a blank cell is the game's own dark clover tile; the 1 2 3
// lamps under the board are the respin counter, relit on every hit.

const COLS = 5, ROWS = 5;
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

class Clover extends CloverSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES) * BET));
  }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => { for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art }); })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  // a few px of bounce, not the tall-reel default: a clover cell should settle, not jump
  .speedProfile(CLOVER_SPEED)
  .respins(3)
  .lockAnimation('landing')
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 14);
// the game's framing: gradient panel + grid lines in the gaps, behind a chrome-less board
const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid);
app.stage.addChild(board.container);

// -- respin counter: three lamps, lit = respins left --
const counter = new PIXI.Container();
const lamps = [];
for (let i = 0; i < 3; i++) {
  const lamp = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const digit = new PIXI.BitmapText({ text: String(i + 1), style: { fontFamily: 'CloverValue', fontSize: 22 } });
  digit.anchor.set(0.5);
  lamp.addChild(bg, digit);
  lamp.x = i * 52;
  counter.addChild(lamp);
  lamps.push({ bg, digit });
}
const lightLamps = (left) => {
  lamps.forEach(({ bg, digit }, i) => {
    const lit = i < left;
    bg.clear().roundRect(-24, -13, 48, 26, 4).fill({ color: lit ? 0xf5b400 : 0x0b1a4a }).stroke({ color: lit ? 0xffe27a : 0x3f6bd8, width: 1 });
    digit.alpha = lit ? 1 : 0.45;
  });
};
counter.position.set(app.screen.width / 2 - 52, board.container.y + boardH + 34);
app.stage.addChild(counter);
lightLamps(0);
board.events.on('respins:changed', ({ value }) => lightLamps(value));

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, counter.y + 22);
app.stage.addChild(hud);

let total = 0;
board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value));
});
board.events.on('coin:locked', ({ coin, locked, capacity }) => {
  total += coin.data.value;
  hud.text = `${locked}/${capacity} held · total ${fmt(total)}`;
});

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) * BET } });
const SEED = [{ reel: 1, cell: 1 }, { reel: 3, cell: 4 }, { reel: 4, cell: 0 }, { reel: 0, cell: 3 }].map(gold);
const ROUNDS = [[{ reel: 0, cell: 0 }, { reel: 2, cell: 2 }], [{ reel: 4, cell: 1 }, { reel: 1, cell: 4 }], [], [{ reel: 2, cell: 0 }, { reel: 3, cell: 2 }], [], [], []];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); counter.destroy(); } catch {} grid.destroy({ children: true }); board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    total = 0;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) { const sym = board.symbolAt(c.cell); sym.setLabel(fmt(c.data.value)); sym.playIdle(); total += c.data.value; }
    hud.text = `${SEED.length}/${board.capacity} held · total ${fmt(total)}`;
    await sleep(400);
    for (const cells of ROUNDS) {
      const res = await board.respin(cells.map(gold));
      await sleep(400);
      if (res.done) break;
    }
    await board.playWin();
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
