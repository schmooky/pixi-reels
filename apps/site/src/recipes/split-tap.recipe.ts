// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, pickWeighted, DebugPlaque, SilkGraphics
//
// Tap any cell to split it in two. The readout prints the call each tap
// makes; pick `grow` or `keep` above the board for what gives:
//   - `grow`: the cells keep their size and the reel grows;
//   - `keep`: the reel keeps its height and its cells shrink.
// Spin to start over: `resetColumns()` puts every reel back to the cells it
// was built with, at their size.
//
// The board anchors its reels at the top (`reelAnchor('start')`), so a reel
// grows downward and nothing else moves.

const REELS = 5;
const ROWS = 4;
const SIZE = 64;
const GAP = 6;
const FRAME_W = REELS * (SIZE + GAP) - GAP;
const FRAME_H = 330;
const TOP_H = 40; // the mode toggle
const MAX_CELLS = 8; // this demo's cap, so a kept cell stays readable
const FILL = { 7: 4, 8: 4, 9: 4, 10: 3, J: 3, Q: 2, K: 2, A: 2 };
const GOLD = 0xffc94a;
const MUTED = 0x8a8f98;
const STEP = 0.22; // seconds a pop takes to make room

const reelSet = new ReelSetBuilder()
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

// --- Layout: toggle, a window the board zooms out inside, readout ---------
const stage = new PIXI.Container();
// Fixed bounds, so the runner fits the window once and the board can grow.
stage.addChild(new PIXI.Graphics().rect(0, 0, FRAME_W, TOP_H + FRAME_H + 64).fill({ color: 0, alpha: 0 }));
const camera = new PIXI.Container();
camera.position.set(0, TOP_H);
camera.addChild(reelSet);
const frame = new PIXI.Graphics().rect(-4, TOP_H - 4, FRAME_W + 8, FRAME_H + 8).fill(0xffffff);
camera.mask = frame;
stage.addChild(camera, frame);

const hud = new DebugPlaque({
  rows: ['tap a cell to split it', ''],
  minWidth: FRAME_W,
  maxWidth: FRAME_W,
  reserveRows: 2,
});
hud.position.set(0, TOP_H + FRAME_H + 12);
stage.addChild(hud);

// A board taller than its window zooms out, centred across it. A later fit
// overwrites this one, which then settles too.
function fit(duration = 0.3) {
  const scale = Math.min(1, FRAME_H / reelSet.viewport.maskHeight);
  return new Promise((resolve) => {
    gsap.to(camera.scale, { x: scale, y: scale, duration, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(camera, {
      x: (FRAME_W - FRAME_W * scale) / 2,
      duration,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onComplete: resolve,
      onInterrupt: resolve,
    });
  });
}

// --- grow / keep toggle ----------------------------------------------------
let mode = 'grow';
const toggles = ['grow', 'keep'].map((name, i) => {
  const button = new DebugPlaque({ rows: [name], radius: 'pill', align: 'center', minWidth: 76, fontSize: 12 });
  button.position.set(i * 86, 0);
  button.eventMode = 'static';
  button.cursor = 'pointer';
  button.on('pointertap', () => {
    mode = name;
    paintToggles();
  });
  stage.addChild(button);
  return { name, button };
});
function paintToggles() {
  for (const { name, button } of toggles) {
    button.setRows([{ text: name, color: name === mode ? GOLD : MUTED }]);
  }
}
paintToggles();

// --- The split, on screen ----------------------------------------------
// `splitSymbol()` only places cells; the motion is this demo's. Every cell
// on the reel slides from where it stood into its new cell, and the new one
// unfolds from the bottom edge of the cell it split from.
let running = null; // the timeline in flight, for cleanup

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
function flash(tl, reel, row) {
  const g = new SilkGraphics();
  g.roundRect(0, reel.getSymbolAt(row).view.y, SIZE, reel.cellMain, 4).fill({ color: 0xffffff });
  g.position.set(reel.container.x, reel.container.y);
  g.alpha = 0;
  reelSet.addChild(g);
  tl.fromTo(g, { alpha: 0.8 }, { alpha: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, 0.05);
  tl.call(() => g.destroy(), null, 0.4);
}

async function split(r, cell) {
  const reel = reelSet.reels[r];
  if (reel.visibleCells >= MAX_CELLS) {
    hud.setRows([`reel ${r + 1} is full (${MAX_CELLS} cells in this demo)`, 'spin to start over']);
    return;
  }
  const id = reelSet.getVisibleGrid()[r][cell];
  const before = Array.from({ length: reel.visibleCells }, (_, row) => ({
    y: reel.getSymbolAt(row).view.y,
    h: reel.cellMain,
  }));
  reelSet.splitSymbol(r, cell, [id, id], { height: mode });
  hud.setRows([
    { text: `splitSymbol(${r}, ${cell}, ['${id}', '${id}'], { height: '${mode}' })`, color: GOLD },
    `reel ${r + 1}: ${reel.visibleCells} cells of ${reel.cellMain.toFixed(1)}px, ${Math.round(reel.extent)}px tall`,
  ]);
  const tl = gsap.timeline();
  running = tl;
  flash(tl, reel, cell + 1);
  reflow(tl, reel, before, cell + 1);
  await Promise.all([tl, fit(STEP)]);
  running = null;
  // Every tween ended on the engine's own positions; snap to be exact.
  reel.motion.snapToGrid();
}

// --- Taps: one hit area over the window, resolved to a cell ---------------
let busy = false; // a tap's split in flight
let inRound = false; // a spin and its reset in flight
const hit = new PIXI.Graphics().rect(0, TOP_H, FRAME_W, FRAME_H).fill({ color: 0xffffff, alpha: 0 });
hit.eventMode = 'static';
hit.cursor = 'pointer';
hit.on('pointertap', async (event) => {
  if (busy || inRound) return;
  const at = event.getLocalPosition(reelSet);
  for (let r = 0; r < reelSet.reels.length; r++) {
    for (let cell = 0; cell < reelSet.reels[r].visibleCells; cell++) {
      const b = reelSet.getCellBounds(r, cell);
      if (at.x < b.x || at.x > b.x + b.width || at.y < b.y || at.y > b.y + b.height) continue;
      busy = true;
      try {
        await split(r, cell);
      } finally {
        busy = false;
      }
      return;
    }
  }
});
stage.addChild(hit);

// --- The round ------------------------------------------------------------
async function onSpin() {
  inRound = true;
  try {
    running?.progress(1); // a split still unfolding ends where it was going
    reelSet.resetColumns(); // back to 5 x 4, at the builder's cell size
    await fit();
    hud.setRows(['tap a cell to split it', '']);
    const spin = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(
      Array.from({ length: REELS }, () => ({ visible: Array.from({ length: ROWS }, () => pickWeighted(FILL)) })),
    );
    await spin;
  } finally {
    inRound = false;
  }
}

return {
  reelSet,
  stage,
  onSpin,
  cleanup: () => {
    running?.kill();
    gsap.killTweensOf(camera);
    gsap.killTweensOf(camera.scale);
    for (const reel of reelSet.reels) {
      for (const symbol of reel.symbols) {
        gsap.killTweensOf(symbol.view);
        gsap.killTweensOf(symbol.view.scale);
      }
    }
  },
};
