// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, PIXI, gsap, app
//
// The game's own framing: cells in a visible grid with real gaps between
// them, and the gaps are not empty - the background under the board shows
// through them. Nothing here is a board feature. The gaps come from
// cellSize({ columnGap, rowGap }), the board draws no chrome, and a couple
// of plain PIXI.Graphics sit behind it: a gradient panel and grid lines
// drawn down the middle of every gap. The cells themselves are the empty
// tile, so the background is only ever seen in the gaps and the margin.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, GAP = 10;
const BET = 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
class Clover extends CloverSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES) * BET));
  }
}

const boardW = COLS * CELL.width + (COLS - 1) * GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * GAP;
const ox = Math.round((app.screen.width - boardW) / 2);
const oy = Math.round((app.screen.height - boardH) / 2 - 10);
const MARGIN = 16;

// -- the background: everything the gaps reveal, added BEFORE the board --
const bg = new PIXI.Container();
app.stage.addChild(bg);

// the panel: a navy-to-blue gradient under the whole grid
const panel = new PIXI.Graphics();
const gradient = new PIXI.FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
  colorStops: [{ offset: 0, color: 0x061236 }, { offset: 0.5, color: 0x102f7a }, { offset: 1, color: 0x061236 }] });
panel.roundRect(ox - MARGIN, oy - MARGIN, boardW + MARGIN * 2, boardH + MARGIN * 2, 14)
  .fill(gradient)
  .stroke({ color: 0x4f8cff, width: 2, alpha: 0.9 });
bg.addChild(panel);

// the grid lines: one down the middle of every gap, a soft wide line under a crisp one
const lines = new PIXI.Graphics();
const gapXs = Array.from({ length: COLS - 1 }, (_, i) => ox + (i + 1) * CELL.width + i * GAP + GAP / 2);
const gapYs = Array.from({ length: ROWS - 1 }, (_, i) => oy + (i + 1) * CELL.height + i * GAP + GAP / 2);
for (const [width, alpha] of [[GAP, 0.35], [2, 0.95]]) {
  for (const x of gapXs) lines.moveTo(x, oy - MARGIN + 2).lineTo(x, oy + boardH + MARGIN - 2);
  for (const y of gapYs) lines.moveTo(ox - MARGIN + 2, y).lineTo(ox + boardW + MARGIN - 2, y);
  lines.stroke({ color: 0x5fa0ff, width, alpha });
}
bg.addChild(lines);
const linePulse = gsap.to(lines, { alpha: 0.55, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });

// -- the board: no chrome, so the cells are the empty tiles and the gaps are the background --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: GAP, rowGap: GAP })
  .symbols((r) => { for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art }); })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  .respins(3)
  .lockAnimation('landing')
  .ticker(app.ticker)
  .build();
board.container.position.set(ox, oy);
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, oy + boardH + MARGIN + 8);
app.stage.addChild(hud);

let total = 0;
board.events.on('cell:landed', ({ cell, coin }) => { if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value)); });
board.events.on('coin:locked', ({ coin, locked, capacity }) => {
  total += coin.data.value;
  hud.text = `${locked}/${capacity} held · total ${fmt(total)}`;
});

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) * BET } });
const SEED = [{ reel: 1, cell: 1 }, { reel: 3, cell: 2 }, { reel: 4, cell: 0 }].map(gold);
const ROUNDS = [[{ reel: 0, cell: 0 }, { reel: 2, cell: 2 }], [{ reel: 4, cell: 1 }], [], [{ reel: 2, cell: 0 }], [], [], []];

let busy = false;
return {
  cleanup: () => {
    linePulse.kill();
    try { hud.destroy(); bg.destroy({ children: true }); } catch {}
    board.destroy();
  },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    total = 0;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) { board.symbolAt(c.cell).setLabel(fmt(c.data.value)); total += c.data.value; }
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
