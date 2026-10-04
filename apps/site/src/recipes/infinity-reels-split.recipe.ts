// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app, pickWeighted, DebugPlaque, SilkGraphics,
//                   WinLines
//
// Stacked symbols that split, on infinity reels. Q lands one cell tall or
// stacked two to four cells on a 3 x 4 board. When Q wins on every reel, each
// stack splits into more single Qs than it had cells (1x2 into 3-4, 1x3 into
// 4-6, 1x4 into 5-8) and its reel grows past the frame both ways. While the
// win reaches the last reel, a reel is added and the multiplier goes up by one.
//
// `reelSet.splitBlock(reel, cell, ids)` places a split: the stack covering
// (reel, cell) becomes `ids`, one per cell, the cells above and below keep
// their symbols, and the board re-centres around the taller reel. `expand()`
// adds the reels. The next round goes back with `removeReels()` and
// `resetColumns()`.

const REELS = 3;
const ROWS = 4;
const CW = 96; // 3:2 cells
const CH = 64;
const GAP = 6;
const PITCH = CH + GAP;
const MAX_EXTRA = 4;
const Q_COLOR = CARD_DECK.find((c) => c.id === 'Q').color;
const STACK = { Q2: 2, Q3: 3, Q4: 4 };
const SPLIT = { Q2: [3, 4], Q3: [4, 5, 6], Q4: [5, 6, 7, 8] };
const FILL = { K: 4, J: 4, 10: 4, wheat: 7 };
const isQ = (id) => id === 'Q' || id in STACK;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(ROWS)
  .symbolSize(CW, CH)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARD_DECK.filter((c) => ['Q', 'K', 'J', '10'].includes(c.id))) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label });
    }
    // A stack is one big symbol a reel wide, drawn as one tall Q.
    for (const id of Object.keys(STACK)) r.register(id, CardSymbol, { color: Q_COLOR, label: 'Q' });
    r.register('wheat', CardSymbol, { color: 0x6e5530, label: '' });
  })
  .symbolData({
    Q2: { weight: 0, size: { reels: 1, cells: 2 } },
    Q3: { weight: 0, size: { reels: 1, cells: 3 } },
    Q4: { weight: 0, size: { reels: 1, cells: 4 } },
  })
  .weights({ ...FILL, Q: 3 })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// --- Camera: a fixed window the board zooms out inside --------------------
const VIEW_W = 660;
const VIEW_H = 340;
const READOUT_H = 64;

const stage = new PIXI.Container();
// Fixed bounds, so the runner fits the window once and the board can grow.
stage.addChild(new PIXI.Graphics().rect(0, 0, VIEW_W, VIEW_H + READOUT_H).fill({ color: 0, alpha: 0 }));
const camera = new PIXI.Container();
const windowMask = new PIXI.Graphics().rect(-4, -4, VIEW_W + 8, VIEW_H + 8).fill(0xffffff);
camera.mask = windowMask;
camera.addChild(reelSet);
stage.addChild(camera, windowMask);

// The board's size comes from the engine: `viewport.maskHeight` follows the
// tallest reel, so a split that grows a reel zooms the camera out.
function frame() {
  const w = reelSet.viewport.maskWidth;
  const h = reelSet.viewport.maskHeight;
  const scale = Math.min(1, VIEW_W / w, VIEW_H / h);
  return { scale, x: (VIEW_W - w * scale) / 2, y: (VIEW_H - h * scale) / 2 };
}
function fit() {
  const { scale, x, y } = frame();
  return new Promise((resolve) => {
    gsap.to(camera.scale, { x: scale, y: scale, duration: 0.5, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(camera, { x, y, duration: 0.5, ease: 'power2.inOut', overwrite: 'auto', onComplete: resolve });
  });
}
const start = frame();
camera.scale.set(start.scale);
camera.position.set(start.x, start.y);

// --- Readout -----------------------------------------------------------
const lines = new WinLines(reelSet, { width: 4 });
const hud = new DebugPlaque({ rows: ['press spin', ''], minWidth: VIEW_W, maxWidth: VIEW_W, reserveRows: 2 });
hud.position.set(0, VIEW_H + 12);
stage.addChild(hud);

// Q on each reel from the left, a stack counting once, drawn at its middle.
function qWays() {
  const grid = reelSet.getVisibleGrid();
  const perReel = [];
  for (let r = 0; r < grid.length; r++) {
    const cells = [];
    const seen = new Set();
    grid[r].forEach((id, c) => {
      if (!isQ(id)) return;
      const { anchor, size } = reelSet.getSymbolFootprint(r, c);
      if (seen.has(anchor.cell)) return;
      seen.add(anchor.cell);
      cells.push(anchor.cell + Math.floor(size.cells / 2));
    });
    if (cells.length === 0) break;
    perReel.push(cells);
  }
  return perReel;
}

let multiplier = 1;
function showWays(note) {
  const perReel = qWays();
  const counts = perReel.map((cells) => cells.length);
  const ways = counts.reduce((a, n) => a * n, counts.length ? 1 : 0);
  lines.clear();
  if (perReel.length >= REELS) lines.ways(perReel, { color: 0xffc94a });
  hud.setRows([
    `${reelSet.reels.length} reels   Q ${counts.join(' x ')} = ${ways.toLocaleString()} ways   x${multiplier}`,
    note ? { text: note, color: 0xffc94a } : '',
  ]);
}

// --- The split, on screen ----------------------------------------------
// The stack about to split pulses in a ring drawn in the board's own
// coordinates, so it rides the camera.
function pulse(reel, cell) {
  const b = reelSet.getBlockBounds(reel, cell);
  const ring = new SilkGraphics();
  ring.roundRect(b.x - 5, b.y - 5, b.width + 10, b.height + 10, 10).stroke({ color: 0xffa436, width: 12, alpha: 0.5, blur: 10 });
  ring.roundRect(b.x - 5, b.y - 5, b.width + 10, b.height + 10, 10).stroke({ color: 0xffa436, width: 4 });
  reelSet.addChild(ring);
  return new Promise((resolve) => {
    gsap.fromTo(ring, { alpha: 0.2 }, {
      alpha: 1, duration: 0.14, repeat: 3, yoyo: true, ease: 'sine.inOut',
      onComplete: () => { ring.destroy(); resolve(); },
    });
  });
}

// The new cells unveil down the reel, through a mask in its own container
// that opens from the top of the split to the reel's bottom.
function unveil(reelIndex, from) {
  const reel = reelSet.reels[reelIndex];
  const m = new PIXI.Graphics().rect(-6, 0, CW + 12, 1).fill(0xffffff);
  m.y = -6;
  m.scale.y = Math.max(0.001, from * PITCH + 6);
  reel.container.addChild(m);
  reel.container.mask = m;
  return new Promise((resolve) => {
    gsap.to(m.scale, {
      y: reel.visibleCells * PITCH + 12,
      duration: 0.55,
      ease: 'power2.inOut',
      onComplete: () => {
        if (!reel.container.destroyed) reel.container.mask = null;
        m.destroy();
        resolve();
      },
    });
  });
}

function stackOn(reelIndex) {
  const ids = reelSet.getVisibleGrid()[reelIndex];
  const cell = ids.findIndex((id) => id in STACK);
  return cell < 0 ? null : { cell, id: ids[cell] };
}

// Every stack from `fromReel` on splits, left to right, one at a time.
async function splitStacks(fromReel) {
  for (let r = fromReel; r < reelSet.reels.length; r++) {
    for (let stack = stackOn(r); stack; stack = stackOn(r)) {
      await pulse(r, stack.cell);
      const options = SPLIT[stack.id];
      const n = options[Math.floor(Math.random() * options.length)];
      lines.clear();
      // The board re-centres around a reel that grows. Hold the reels the
      // split does not touch where they are on screen, and slide the split
      // reel from where it stood, so it grows both ways while the camera
      // eases out.
      const ref = r === 0 ? 1 : 0;
      const refBefore = reelSet.reels[ref].mainOffset;
      const selfBefore = reelSet.reels[r].mainOffset;
      const { from } = reelSet.splitBlock(r, stack.cell, new Array(n).fill('Q'));
      const refShift = reelSet.reels[ref].mainOffset - refBefore;
      camera.y -= refShift * camera.scale.y;
      const self = reelSet.reels[r].container;
      gsap.from(self, {
        y: self.y + refShift - (reelSet.reels[r].mainOffset - selfBefore),
        duration: 0.5,
        ease: 'power2.inOut',
      });
      await Promise.all([unveil(r, from), fit()]);
      showWays(`Q 1x${STACK[stack.id]} on reel ${r + 1} splits into ${n}`);
    }
  }
}

// --- Server stand-in ----------------------------------------------------
// Every reel of the base board shows Q, so the feature is worth watching. A
// column with Q holds a stack two to four tall, or one or two single Qs. The
// board grows while the new reel still shows Q.
function column(withQ) {
  const cells = Array.from({ length: ROWS }, () => pickWeighted(FILL));
  if (!withQ) return cells;
  if (Math.random() < 0.65) {
    const h = Math.random() < 0.2 ? 4 : 2 + Math.floor(Math.random() * 2);
    const top = Math.floor(Math.random() * (ROWS - h + 1));
    // A stack's id in every cell it covers, the way `getTargets()` replays one.
    for (let k = 0; k < h; k++) cells[top + k] = `Q${h}`;
  } else {
    cells[Math.floor(Math.random() * ROWS)] = 'Q';
    cells[Math.floor(Math.random() * ROWS)] = 'Q';
  }
  return cells;
}

function serverSpin() {
  const base = Array.from({ length: REELS }, () => column(true));
  const extra = [];
  while (extra.length < MAX_EXTRA) {
    const continues = Math.random() < 0.6;
    extra.push(column(continues));
    if (!continues) break;
  }
  return { base, extra };
}

// --- The round ------------------------------------------------------------
async function onSpin() {
  lines.clear();
  multiplier = 1;
  if (reelSet.reels.length > REELS || reelSet.reels.some((reel) => reel.visibleCells !== ROWS)) {
    hud.setRows(['back to 3 x 4', '']);
    reelSet.removeReels(); // back to the builder's reels
    reelSet.resetColumns(); // and to their cells
    await fit();
  }

  const res = serverSpin();
  const spin = reelSet.spin();
  await new Promise((r) => setTimeout(r, 150));
  reelSet.setResult(res.base.map((visible) => ({ visible })));
  await spin;
  showWays('');
  await splitStacks(0);

  await reelSet.expand({
    columns: res.extra.map((visible) => ({ visible })),
    step: 1,
    onStepAdded: () => { fit(); },
    onStepLanded: async (step) => {
      const reaches = reelSet.getVisibleGrid()[step.from].some(isQ);
      if (!reaches) {
        showWays(`reel ${step.from + 1} shows no Q: the win ends at x${multiplier}`);
        return;
      }
      multiplier += 1;
      showWays(`reel ${step.from + 1} continues the win: x${multiplier}`);
      await splitStacks(step.from);
    },
  });
}

function onSkip() {
  try {
    reelSet.skipSpin();
  } catch {
    // Before the base result arrives there is nothing to land on yet.
    reelSet.requestSkip();
  }
}

// A demo scrolled away mid-zoom unmounts with the tweens still running.
return {
  reelSet,
  stage,
  onSpin,
  onSkip,
  cleanup: () => {
    gsap.killTweensOf(camera);
    gsap.killTweensOf(camera.scale);
    for (const reel of reelSet.reels) gsap.killTweensOf(reel.container);
  },
};
