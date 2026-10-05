// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, pickWeighted, DebugPlaque, SilkGraphics
//
// One split, two ways to make room. Both boards land the same result and
// split the same cells, one copy at a time:
//   - left, `height: 'grow'`: the cells keep their size and the reel grows;
//   - right, `height: 'keep'`: the reel keeps its height and its cells shrink.
// Any symbol one reel wide splits, in any slot:
//
//   reelSet.splitSymbol(reel, cell, ids, { height: 'grow' }); // or 'keep'
//
// These boards anchor their reels at the top (`reelAnchor('start')`), so a
// reel grows downward and nothing else moves. With the default `'center'` it
// grows both ways and the board re-centres around it; the infinity reels
// split demo holds the other reels still with its camera.

const REELS = 5;
const ROWS = 3;
const SIZE = 56;
const GAP = 4;
const FRAME_W = REELS * (SIZE + GAP) - GAP;
const FRAME_H = 300;
const GUTTER = 40;
const TITLE_H = 48;
const MAX_EXTRA = 3; // cells a reel may gain in one round
const FILL = { 7: 4, 8: 4, 9: 4, 10: 3, J: 3, Q: 2, K: 2, A: 2 };
const GOLD = 0xffc94a;
const STEP = 0.22; // seconds a pop takes to make room

function makeBoard() {
  return new ReelSetBuilder()
    .reels(REELS)
    .visibleCells(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(GAP, GAP)
    .reelAnchor('start')
    .symbols((r) => {
      for (const c of CARD_DECK) r.register(c.id, CardSymbol, { color: c.color, label: c.label });
    })
    .weights(FILL)
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker)
    .build();
}

// --- Two panels: a title, and a window the board zooms out inside --------
const stage = new PIXI.Container();
// Fixed bounds, so the runner fits the pair once and a board can grow. The
// extra width on the right keeps the runner's spin button off the boards.
const BUTTON_ROOM = 64;
stage.addChild(
  new PIXI.Graphics().rect(0, 0, FRAME_W * 2 + GUTTER + BUTTON_ROOM, TITLE_H + FRAME_H).fill({ color: 0, alpha: 0 }),
);

function panel(x, mode) {
  const reelSet = makeBoard();
  const camera = new PIXI.Container();
  camera.position.set(x, TITLE_H);
  camera.addChild(reelSet);
  const frame = new PIXI.Graphics().rect(x - 4, TITLE_H - 4, FRAME_W + 8, FRAME_H + 8).fill(0xffffff);
  camera.mask = frame;
  const title = new DebugPlaque({
    title: `height: '${mode}'`,
    rows: [`${ROWS} cells a reel, ${reelSet.reels[0].extent}px tall`],
    minWidth: FRAME_W,
    maxWidth: FRAME_W,
    reserveRows: 1,
  });
  title.position.set(x, 0);
  stage.addChild(camera, frame, title);
  return { reelSet, camera, title, mode, x };
}
const panels = [panel(0, 'grow'), panel(FRAME_W + GUTTER, 'keep')];

// A board taller than its window zooms out, centred across it. A later fit
// overwrites this one, which then settles too.
function fit(p, duration = 0.3) {
  const scale = Math.min(1, FRAME_H / p.reelSet.viewport.maskHeight);
  const x = p.x + (FRAME_W - FRAME_W * scale) / 2;
  return new Promise((resolve) => {
    gsap.to(p.camera.scale, { x: scale, y: scale, duration, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(p.camera, { x, duration, ease: 'power2.inOut', overwrite: 'auto', onComplete: resolve, onInterrupt: resolve });
  });
}

// --- The split, on screen ----------------------------------------------
// `splitSymbol()` only places cells; the motion is this demo's. Each pop is
// one more `splitSymbol()`, and every cell on the reel slides from where it
// stood into its new cell. The new one unfolds from the bottom edge of the
// cell it split from.
const running = new Set(); // timelines in flight, for cleanup

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

// A white flash over the new cell, above the reel masks.
function flash(tl, reelSet, reel, row) {
  const g = new SilkGraphics();
  g.roundRect(0, reel.getSymbolAt(row).view.y, SIZE, reel.cellMain, 4).fill({ color: 0xffffff });
  g.position.set(reel.container.x, reel.container.y);
  g.alpha = 0;
  reelSet.addChild(g);
  tl.fromTo(g, { alpha: 0.8 }, { alpha: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, 0.05);
  tl.call(() => g.destroy(), null, 0.4);
}

async function splitOn(p, { reel: r, cell, count }) {
  const { reelSet } = p;
  const reel = reelSet.reels[r];
  const id = reelSet.getVisibleGrid()[r][cell];
  const fromCells = reel.visibleCells;
  for (let k = 1; k < count; k++) {
    const before = Array.from({ length: reel.visibleCells }, (_, row) => ({
      y: reel.getSymbolAt(row).view.y,
      h: reel.cellMain,
    }));
    reelSet.splitSymbol(r, cell + k - 1, [id, id], { height: p.mode });
    const tl = gsap.timeline();
    running.add(tl);
    flash(tl, reelSet, reel, cell + k);
    reflow(tl, reel, before, cell + k);
    await Promise.all([tl, fit(p, STEP)]);
    running.delete(tl);
    // Every tween ended on the engine's own positions; snap to be exact.
    reel.motion.snapToGrid();
  }
  p.title.setRows([
    { text: `reel ${r + 1}: ${fromCells} -> ${reel.visibleCells} cells, ${Math.round(reel.extent)}px tall`, color: GOLD },
  ]);
}

// --- Server stand-in ----------------------------------------------------
// Two or three cells anywhere split, each into two or three of its own
// symbol, while their reel has gained fewer than MAX_EXTRA cells.
function serverSpin() {
  const columns = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => pickWeighted(FILL)));
  const cells = [];
  for (let reel = 0; reel < REELS; reel++) for (let cell = 0; cell < ROWS; cell++) cells.push({ reel, cell });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const room = new Array(REELS).fill(MAX_EXTRA);
  const splits = [];
  for (const at of cells.slice(0, 2 + Math.floor(Math.random() * 2))) {
    const count = Math.min(2 + Math.floor(Math.random() * 2), room[at.reel] + 1);
    if (count < 2) continue;
    room[at.reel] -= count - 1;
    splits.push({ ...at, count });
  }
  // The lower cell first on a reel, so the cells above keep their index.
  splits.sort((a, b) => a.reel - b.reel || b.cell - a.cell);
  return { columns, splits };
}

// --- The round ------------------------------------------------------------
async function onSpin() {
  for (const p of panels) {
    p.reelSet.resetColumns(); // back to 5 x 3, at the builder's cell size
    p.title.setRows([`${ROWS} cells a reel, ${p.reelSet.reels[0].extent}px tall`]);
  }
  await Promise.all(panels.map((p) => fit(p)));
  const res = serverSpin();
  const spins = panels.map((p) => p.reelSet.spin());
  await new Promise((r) => setTimeout(r, 150));
  for (const p of panels) p.reelSet.setResult(res.columns.map((visible) => ({ visible })));
  await Promise.all(spins);
  for (const split of res.splits) {
    await new Promise((r) => setTimeout(r, 250));
    await Promise.all(panels.map((p) => splitOn(p, split)));
  }
}

return {
  reelSet: panels[0].reelSet,
  stage,
  onSpin,
  // One press lands both boards.
  onSkip: () => {
    for (const p of panels) p.reelSet.requestSkip();
  },
  cleanup: () => {
    for (const tl of running) tl.kill();
    for (const p of panels) {
      gsap.killTweensOf(p.camera);
      gsap.killTweensOf(p.camera.scale);
      for (const reel of p.reelSet.reels) {
        for (const symbol of reel.symbols) {
          gsap.killTweensOf(symbol.view);
          gsap.killTweensOf(symbol.view.scale);
        }
      }
    }
    // The runner destroys the set it was handed; the other one is ours.
    panels[1].reelSet.destroy();
  },
};
