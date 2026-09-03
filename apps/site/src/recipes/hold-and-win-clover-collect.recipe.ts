// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, cloverGridBackground, loadHwClover, CLOVER_SPEED, PIXI, gsap, app
//
// The COLLECT clover the way the game plays it. Every held clover idles
// (breathes) from the moment it lands. When the blue COLLECT clover locks,
// lightning strikes from it to each gold clover's number in turn: the number
// is taken - the collect face counts it up - and the struck clover dims to
// grey, still held but spent. The bolts are plain Graphics redrawn every
// frame; the strike IS the collect clover's win moment.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const VALUES = [1, 1.5, 2, 2.5, 3, 5];

const art = await loadHwClover();
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
class Clover extends CloverSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick(VALUES))); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => {
    for (const id of ['gold', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art });
    r.register('collect', Clover, { art, font: 'CloverJackpot', labelOffset: 0.02 });
  })
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
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid);
app.stage.addChild(board.container);
// bolts draw above the board - the held clovers are lifted inside it, this sits after it
const boltLayer = new PIXI.Container();
app.stage.addChild(boltLayer);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);

const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const paint = (coin) => { if (coin.id === 'gold') board.symbolAt(coin.cell).setLabel(fmt(coin.data.value)); };
board.events.on('cell:landed', ({ coin }) => { if (coin) paint(coin); });
const golds = () => board.lockedCoins.filter((c) => c.id === 'gold' && !board.symbolAt(c.cell).isDimmed);

// A bolt from a to b: a jagged line re-jittered every frame for `ms`, three
// strokes wide-to-thin for the glow, then a quick fade.
function strike(a, b, ms = 260) {
  const g = new PIXI.Graphics();
  boltLayer.addChild(g);
  const draw = () => {
    g.clear();
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const n = Math.max(6, Math.round(len / 16));
    const pts = [a];
    for (let i = 1; i < n; i++) {
      const t = i / n, j = (Math.random() - 0.5) * 26 * Math.sin(Math.PI * t);
      pts.push({ x: a.x + dx * t + nx * j, y: a.y + dy * t + ny * j });
    }
    pts.push(b);
    for (const [width, color, alpha] of [[11, 0x3f8cff, 0.22], [4, 0xa8d4ff, 0.7], [1.5, 0xffffff, 1]]) {
      g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
    }
  };
  draw();
  app.ticker.add(draw);
  return new Promise((res) => setTimeout(() => {
    app.ticker.remove(draw);
    gsap.to(g, { alpha: 0, duration: 0.12, onComplete: () => { g.destroy(); res(); } });
  }, ms));
}

const pop = (t) => { if (!t) return; const sx = t.scale.x, sy = t.scale.y; gsap.fromTo(t.scale, { x: sx * 1.5, y: sy * 1.5 }, { x: sx, y: sy, duration: 0.28, ease: 'power2.out' }); };

// The collect: strike each value in reading order, count it onto the
// collect face, dim the clover it came from.
async function collect(coin) {
  const collector = board.symbolAt(coin.cell);
  const from = abs(coin.cell);
  let sum = 0;
  collector.setLabel(fmt(0));
  hud.text = 'COLLECT locked - lightning takes every value';
  await collector.playWin();
  const targets = golds().sort((p, q) => (p.cell.cell - q.cell.cell) || (p.cell.reel - q.cell.reel));
  for (const g of targets) {
    const sym = board.symbolAt(g.cell);
    const at = abs(g.cell);
    const bolt = strike(from, { x: at.x, y: at.y + CELL.height * 0.06 }, 240);
    await sleep(110);
    pop(sym.label);
    sum += g.data.value;
    collector.setLabel(fmt(sum));
    pop(collector.label);
    await bolt;
    sym.setDimmed(true); // spent: still held, no longer idling
    await sleep(70);
  }
  await collector.playWin();
  hud.text = `collected ${fmt(sum)} · spent clovers stay held, dimmed`;
  await sleep(500);
}

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick(VALUES) } });
const SEED = [{ reel: 0, cell: 0 }, { reel: 3, cell: 1 }, { reel: 1, cell: 2 }].map(gold);
const ROUNDS = [
  [gold({ reel: 4, cell: 0 }), gold({ reel: 2, cell: 2 })],
  [gold({ reel: 0, cell: 1 })],
  [{ cell: { reel: 2, cell: 1 }, id: 'collect', data: { value: 0 } }],
  [gold({ reel: 4, cell: 2 })],
  [], [], [],
];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); grid.destroy({ children: true }); boltLayer.destroy({ children: true }); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) { paint(c); board.symbolAt(c.cell).playIdle(); }
    hud.text = 'held clovers idle until the feature ends';
    await sleep(400);
    for (const hits of ROUNDS) {
      const res = await board.respin(hits);
      for (const coin of res.hits) if (coin.id === 'collect') await collect(coin);
      await sleep(350);
      if (res.done) break;
    }
    const total = board.lockedCoins.filter((c) => c.id === 'gold').reduce((a, g) => a + g.data.value, 0);
    hud.text = `feature over · gold on board ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
