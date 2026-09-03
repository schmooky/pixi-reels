// @ts-nocheck
// Injected: HoldAndWinBuilder, RoundedRectMaskStrategy, CloverSpineSymbol, CloverSymbol, loadHwCloverSpines, CLOVER_SPEED, CLOVER_CELL, PIXI, gsap, app
//
// The game's own framing: cells in a visible grid with real gaps between
// them, and the gaps are not empty - the background under the board shows
// through them. Nothing here is a board feature. The gaps come from
// cellSize({ columnGap, rowGap }), the board draws no chrome, and a couple
// of plain PIXI.Graphics sit behind it: a gradient panel and, per cell, a
// rounded frame traced on the cell's exact bounds. A rounded cell mask cuts
// each tile's corners on the same radius, so frame and tile agree to the
// pixel. The background is only ever seen in the gaps and the margin.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, GAP = 8;
const SCALE = CELL.width / CLOVER_CELL.width; // the skeletons are authored at the 202x170 cell
const BET = 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwCloverSpines(); // atlas + skeletons, plus the sheets for titles and plaques
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
class Clover extends CloverSpineSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES) * BET));
  }
}

const boardW = COLS * CELL.width + (COLS - 1) * GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * GAP;
const ox = Math.round((app.screen.width - boardW) / 2);
const oy = Math.round((app.screen.height - boardH) / 2 - 10);
const MARGIN = 8;

// -- the background: everything the gaps reveal, added BEFORE the board --
const bg = new PIXI.Container();
app.stage.addChild(bg);
const R = 8; // cell corner radius: the frame and the cell mask share it

// the panel: a navy-to-blue gradient under the whole grid
const panel = new PIXI.Graphics();
const gradient = new PIXI.FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
  colorStops: [{ offset: 0, color: 0x061236 }, { offset: 0.5, color: 0x102f7a }, { offset: 1, color: 0x061236 }] });
panel.roundRect(ox - MARGIN, oy - MARGIN, boardW + MARGIN * 2, boardH + MARGIN * 2, R + MARGIN)
  .fill(gradient)
  .stroke({ color: 0x4f8cff, width: 2, alpha: 0.9 });
bg.addChild(panel);

// one frame per cell, traced on the cell's exact bounds: a fill the tile sits
// on, a soft glow just outside the edge, a crisp line on it. The gap between
// two cells therefore holds two outlines with the panel between them.
const frames = new PIXI.Graphics();
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < ROWS; r++) {
    const cx = ox + c * (CELL.width + GAP), cy = oy + r * (CELL.height + GAP);
    frames.roundRect(cx - 3, cy - 3, CELL.width + 6, CELL.height + 6, R + 3).stroke({ color: 0x5fa0ff, width: 4, alpha: 0.28 });
    frames.roundRect(cx, cy, CELL.width, CELL.height, R).fill({ color: 0x0b1a4a }).stroke({ color: 0x5fa0ff, width: 1.5, alpha: 0.95 });
  }
}
bg.addChild(frames);
const framePulse = gsap.to(frames, { alpha: 0.7, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });

// -- the board: no chrome, so the cells are the empty tiles and the gaps are the background --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: GAP, rowGap: GAP })
  .symbols((r) => { for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { scale: SCALE }); })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  // a few px of bounce, not the tall-reel default: a clover cell should settle, not jump
  .speedProfile(CLOVER_SPEED)
  // rounded cells, cut on the frame's own radius
  // the mask cuts the tile's corners on the frame's radius
  .cellMask(() => new RoundedRectMaskStrategy({ radius: R }))
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
    framePulse.kill();
    try { hud.destroy(); bg.destroy({ children: true }); } catch {}
    board.destroy();
  },
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
