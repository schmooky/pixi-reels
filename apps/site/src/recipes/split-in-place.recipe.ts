// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, pickWeighted, DebugPlaque, SilkGraphics,
//                   WinLines
//
// Symbols that split in place, on MultiWays. A reel's height is fixed here,
// so a split makes room inside it: every cell on the reel shrinks, and the
// ways go up with the count. The server names the winning symbol and which
// of its cells split, into two or three copies each.
//
// `reelSet.splitSymbol(reel, cell, ids, { height: 'keep' })` places a split:
// the cell becomes `ids`, one per cell, the cells above and below keep their
// symbols, and the reel keeps its height. `'keep'` is the default on
// MultiWays; pass it on any other board. This demo splits off one copy at a
// time, so each pop squeezes the reel once more.

const REELS = 6;
const MIN_CELLS = 2;
const MAX_CELLS = 8;
const REEL_H = 300;
const CW = 72;
const GAP = 4;
const WIN_IDS = ['A', 'K', 'Q'];
const FILL = { 7: 5, 8: 5, 9: 5, 10: 4, J: 4 };
const GOLD = 0xffc94a;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minCells: MIN_CELLS, maxCells: MAX_CELLS, reelExtent: REEL_H })
  // Every reel starts at MAX_CELLS: size the cell so they and their gaps fill REEL_H.
  .symbolSize(CW, (REEL_H - (MAX_CELLS - 1) * GAP) / MAX_CELLS)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARD_DECK) r.register(c.id, CardSymbol, { color: c.color, label: c.label });
  })
  .weights({ ...FILL, A: 1, K: 1, Q: 1 })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

// --- Readout -----------------------------------------------------------
const WIDTH = reelSet.viewport.maskWidth;
const stage = new PIXI.Container();
stage.addChild(reelSet);
const lines = new WinLines(reelSet, { width: 4 });
const hud = new DebugPlaque({ rows: ['press spin', ''], minWidth: WIDTH, maxWidth: WIDTH, reserveRows: 2 });
hud.position.set(0, REEL_H + 12);
stage.addChild(hud);

// The winning symbol on each reel from the left, cell by cell.
function waysOf(id) {
  const perReel = [];
  for (const column of reelSet.getVisibleGrid()) {
    const cells = column.flatMap((symbol, cell) => (symbol === id ? [cell] : []));
    if (cells.length === 0) break;
    perReel.push(cells);
  }
  return perReel;
}

function showWays(id, note) {
  const perReel = waysOf(id);
  const counts = perReel.map((cells) => cells.length);
  const ways = perReel.length >= 3 ? counts.reduce((a, n) => a * n, 1) : 0;
  lines.clear();
  if (ways > 0) lines.ways(perReel, { color: GOLD });
  hud.setRows([
    `${id}  ${counts.join(' x ')} = ${ways.toLocaleString()} ways`,
    note ? { text: note, color: GOLD } : '',
  ]);
}

// --- The split, on screen ----------------------------------------------
// `splitSymbol()` only places cells; the motion is this demo's. The cell
// glows, then copies pop out of it one by one. Each pop is one more
// `splitSymbol()`, and every cell on the reel slides and shrinks from where
// it stood into its new cell.
const STEP = 0.22; // seconds a pop takes to make room
let running = null; // the timeline in flight, for cleanup

// Effects for one reel, above the reel masks so a glow is not clipped.
function overlayFor(reelIndex) {
  const box = new PIXI.Container();
  const c = reelSet.reels[reelIndex].container;
  box.position.set(c.x, c.y);
  reelSet.addChild(box);
  return box;
}

// Every cell starts where it stood; the new one unfolds from the bottom edge
// of the cell it split from. `before` is each row's { y, h } before the split.
function reflow(tl, reel, before, inserted) {
  for (let row = 0; row < reel.visibleCells; row++) {
    const view = reel.getSymbolAt(row).view;
    const y = view.y;
    const above = before[row - 1];
    const from = row < inserted ? before[row] : row === inserted ? { y: above.y + above.h, h: 0 } : above;
    view.y = from.y;
    view.scale.y = Math.max(0.02, from.h / reel.cellMain);
    tl.to(view, { y, duration: STEP, ease: 'power2.out' }, 0);
    tl.to(view.scale, { y: 1, duration: STEP, ease: 'back.out(1.7)' }, 0);
  }
}

// A white flash over the new cell and a few sparks off it.
function pop(tl, box, y, h) {
  const flash = new SilkGraphics();
  flash.roundRect(0, y, CW, h, 4).fill({ color: 0xffffff });
  flash.alpha = 0;
  box.addChild(flash);
  tl.fromTo(flash, { alpha: 0.8 }, { alpha: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, 0.05);
  for (let k = 0; k < 5; k++) {
    const spark = new SilkGraphics();
    spark.circle(0, 0, 2.5).fill({ color: GOLD });
    spark.position.set(CW / 2, y + h / 2);
    spark.alpha = 0;
    box.addChild(spark);
    const angle = (k / 5) * Math.PI * 2 + Math.random();
    tl.fromTo(spark, { alpha: 1 }, {
      x: CW / 2 + Math.cos(angle) * 44,
      y: y + h / 2 + Math.sin(angle) * 22,
      alpha: 0,
      duration: 0.35,
      ease: 'power2.out',
      immediateRender: false,
    }, 0.05);
  }
}

async function splitInPlace(r, cell, count, id) {
  const reel = reelSet.reels[r];
  const box = overlayFor(r);
  lines.clear();

  // 1. The cell glows.
  const y0 = reel.getSymbolAt(cell).view.y;
  const glow = new SilkGraphics();
  glow.roundRect(-3, y0 - 3, CW + 6, reel.cellMain + 6, 6).stroke({ color: 0xffa436, width: 12, alpha: 0.5, blur: 10 });
  glow.roundRect(-3, y0 - 3, CW + 6, reel.cellMain + 6, 6).stroke({ color: GOLD, width: 3 });
  box.addChild(glow);
  running = gsap.fromTo(glow, { alpha: 0 }, { alpha: 1, duration: 0.25 });
  await running;
  running = gsap.to(glow, { alpha: 0, duration: 0.15 });
  await running;

  // 2. Pop, pop: one more copy at a time, below the ones before it.
  for (let k = 1; k < count; k++) {
    const before = Array.from({ length: reel.visibleCells }, (_, row) => ({
      y: reel.getSymbolAt(row).view.y,
      h: reel.cellMain,
    }));
    reelSet.splitSymbol(r, cell + k - 1, [id, id], { height: 'keep' });
    const tl = gsap.timeline();
    running = tl;
    pop(tl, box, reel.getSymbolAt(cell + k).view.y, reel.cellMain);
    reflow(tl, reel, before, cell + k);
    await tl;
    // Every tween ended on the engine's own positions; snap to be exact.
    reel.motion.snapToGrid();
  }
  running = null;
  box.destroy({ children: true });
  showWays(id, `${id} on reel ${r + 1} splits into ${count}`);
}

// --- Server stand-in ----------------------------------------------------
// The winning symbol runs three reels or more from the left. One to three of
// its cells split, into two or three copies, while their reel has room under
// MAX_CELLS.
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function serverSpin() {
  const shape = Array.from({ length: REELS }, () => MIN_CELLS + Math.floor(Math.random() * 4));
  const win = WIN_IDS[Math.floor(Math.random() * WIN_IDS.length)];
  const reach = 3 + Math.floor(Math.random() * (REELS - 2));
  const columns = shape.map((cells, r) => {
    const column = Array.from({ length: cells }, () => pickWeighted(FILL));
    if (r < reach) {
      column[Math.floor(Math.random() * cells)] = win;
      if (Math.random() < 0.3) column[Math.floor(Math.random() * cells)] = win;
    }
    return column;
  });
  const winning = [];
  columns.forEach((column, r) => column.forEach((id, cell) => {
    if (r < reach && id === win) winning.push({ reel: r, cell });
  }));
  const room = shape.map((cells) => MAX_CELLS - cells);
  const splits = [];
  for (const at of shuffle(winning).slice(0, 1 + Math.floor(Math.random() * 3))) {
    const count = Math.min(2 + Math.floor(Math.random() * 2), room[at.reel] + 1);
    if (count < 2) continue;
    room[at.reel] -= count - 1;
    splits.push({ ...at, count });
  }
  // The lower cell first on a reel, so the cells above keep their index.
  splits.sort((a, b) => a.reel - b.reel || b.cell - a.cell);
  return { shape, columns, win, splits };
}

// --- The round ------------------------------------------------------------
async function onSpin() {
  lines.clear();
  hud.setRows(['spinning', '']);
  const res = serverSpin();
  const spin = reelSet.spin();
  await new Promise((r) => setTimeout(r, 150));
  reelSet.setShape(res.shape);
  reelSet.setResult(res.columns.map((visible) => ({ visible })));
  await spin;
  showWays(res.win, '');
  for (const split of res.splits) {
    await new Promise((r) => setTimeout(r, 250));
    await splitInPlace(split.reel, split.cell, split.count, res.win);
  }
}

// A demo scrolled away mid-split unmounts with the tweens still running.
return {
  reelSet,
  stage,
  onSpin,
  cleanup: () => {
    running?.kill();
    for (const reel of reelSet.reels) {
      for (const symbol of reel.symbols) {
        gsap.killTweensOf(symbol.view);
        gsap.killTweensOf(symbol.view.scale);
      }
    }
  },
};
