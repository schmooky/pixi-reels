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
// `reelSet.splitSymbol(reel, cell, ids)` places a split: the stack covering
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
function fit(duration = 0.5) {
  const { scale, x, y } = frame();
  return new Promise((resolve) => {
    gsap.to(camera.scale, { x: scale, y: scale, duration, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(camera, { x, y, duration, ease: 'power2.inOut', overwrite: 'auto', onComplete: resolve });
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
// `splitSymbol()` only places cells; every bit of motion here is this demo's,
// timed on the Buffalo Win original. The stack glows and burns, then single
// Qs pop in one by one from its top cell down. Each pop past the stack's own
// cells pushes the cells below down a cell, and the whole reel drifts up as
// the board re-centres around it.
const POP_GAP = 0.1; // seconds between pops
const BURN = 0.45; // seconds the stack burns before it breaks
let running = null; // the split timeline in flight, for cleanup

// Effects for one reel, drawn above the reel masks so a glow is not clipped,
// and moved with the reel's container as it drifts.
function reelOverlay(reelIndex) {
  const box = new PIXI.Container();
  reelSet.addChild(box);
  const follow = () => {
    const c = reelSet.reels[reelIndex].container;
    box.position.set(c.x, c.y);
  };
  follow();
  return { box, follow };
}

// The glow frame around the cells from `top` down `cells` cells, and the
// fire over the cells from `fireTop` to `fireBottom` (reel-local rows).
function drawBurn(g, glow, top, cells, fireTop, fireBottom) {
  g.clear();
  if (fireBottom > fireTop) {
    const y = fireTop * PITCH;
    const h = (fireBottom - fireTop) * PITCH - GAP;
    g.roundRect(0, y, CW, h, 6).fill({ color: 0xff7a1a, alpha: 0.9 });
    g.roundRect(6, y + 6, CW - 12, Math.max(0, h - 12), 5).fill({ color: 0xffd36b, alpha: 0.8 });
  }
  glow.clear();
  const y = top * PITCH - 4;
  const h = cells * PITCH - GAP + 8;
  glow.roundRect(-4, y, CW + 8, h, 8).stroke({ color: 0xffa436, width: 16, alpha: 0.5, blur: 12 });
  glow.roundRect(-4, y, CW + 8, h, 8).stroke({ color: 0xffc94a, width: 3 });
}

// A pop: the cell unfolds down from its top edge, with a flash and sparks.
// `immediateRender: false` keeps each one hidden until its own turn.
function pop(tl, at, view, overlay, row) {
  tl.set(view, { alpha: 1 }, at);
  tl.fromTo(view.scale, { y: 0.15 }, { y: 1, duration: 0.2, ease: 'back.out(2.2)', immediateRender: false }, at);
  const flash = new SilkGraphics();
  flash.roundRect(0, row * PITCH, CW, CH, 6).fill({ color: 0xffffff });
  flash.alpha = 0;
  overlay.box.addChild(flash);
  tl.fromTo(flash, { alpha: 0.85 }, { alpha: 0, duration: 0.25, ease: 'power2.out', immediateRender: false }, at);
  for (let k = 0; k < 5; k++) {
    const spark = new SilkGraphics();
    spark.circle(0, 0, 2.5).fill({ color: 0xffd36b });
    spark.position.set(CW / 2, row * PITCH + CH / 2);
    spark.alpha = 0;
    overlay.box.addChild(spark);
    const angle = (k / 5) * Math.PI * 2 + Math.random();
    tl.fromTo(spark, { alpha: 1 }, {
      x: CW / 2 + Math.cos(angle) * 46,
      y: row * PITCH + CH / 2 + Math.sin(angle) * 30,
      alpha: 0,
      duration: 0.35,
      ease: 'power2.out',
      immediateRender: false,
    }, at);
  }
}

function stackOn(reelIndex) {
  const ids = reelSet.getVisibleGrid()[reelIndex];
  const cell = ids.findIndex((id) => id in STACK);
  return cell < 0 ? null : { cell, id: ids[cell] };
}

async function splitStack(r, stack) {
  const top = stack.cell;
  const h = STACK[stack.id];
  const options = SPLIT[stack.id];
  const n = options[Math.floor(Math.random() * options.length)];
  const before = reelSet.reels[r].visibleCells;

  // 1. Glow, then burn.
  const overlay = reelOverlay(r);
  const fire = new SilkGraphics();
  const glow = new SilkGraphics();
  overlay.box.addChild(fire, glow);
  drawBurn(fire, glow, top, h, top, top + h);
  fire.alpha = 0;
  lines.clear();
  await new Promise((resolve) => {
    gsap.fromTo(glow, { alpha: 0 }, { alpha: 1, duration: 0.2 });
    gsap.to(fire, { alpha: 1, duration: BURN, ease: 'power1.in', onComplete: resolve });
  });

  // 2. The split, under the fire. The board re-centres around the reel:
  // hold the reels it does not touch still on screen, and put this reel
  // back where it stood, to drift from there.
  const ref = r === 0 ? 1 : 0;
  const refBefore = reelSet.reels[ref].mainOffset;
  const selfBefore = reelSet.reels[r].mainOffset;
  const { from } = reelSet.splitSymbol(r, top, new Array(n).fill('Q'));
  const reel = reelSet.reels[r];
  const refShift = reelSet.reels[ref].mainOffset - refBefore;
  camera.y -= refShift * camera.scale.y;
  const settled = reel.container.y;
  reel.container.y = settled + refShift - (reel.mainOffset - selfBefore);
  overlay.follow();

  // The new cells wait hidden; the cells below stand where they were.
  const grown = n - h;
  const fresh = Array.from({ length: n }, (_, k) => reel.getSymbolAt(from + k).view);
  const below = Array.from({ length: before - top - h }, (_, j) => reel.getSymbolAt(from + n + j).view);
  const belowY = below.map((view) => view.y - grown * PITCH);
  for (const view of fresh) view.alpha = 0;
  below.forEach((view, j) => { view.y = belowY[j]; });
  // The mask is the reel's new height already, reaching above where the reel
  // stands: hide the buffer symbols it would show until the reel drifts up.
  const buffers = reel.symbols.slice(0, reel.bufferStart).map((symbol) => symbol.view);
  for (const view of buffers) view.alpha = 0;

  // 3. Pop, pop, pop, from the stack's top cell down.
  const tl = gsap.timeline();
  running = tl;
  fresh.forEach((view, k) => {
    const at = k * POP_GAP;
    pop(tl, at, view, overlay, from + k);
    // The fire burns down what is left of the stack; the glow frame grows to
    // hold every pop.
    tl.call(() => drawBurn(fire, glow, top, Math.max(h, k + 1), top + k + 1, top + h), null, at);
    // A pop past the stack's own cells pushes the cells below down one.
    if (k >= h) {
      below.forEach((cell, j) => {
        tl.to(cell, { y: belowY[j] + (k - h + 1) * PITCH, duration: 0.12, ease: 'power2.out' }, at);
      });
    }
  });
  const total = n * POP_GAP + 0.25;
  tl.call(() => drawBurn(fire, glow, top, n, 0, 0), null, n * POP_GAP);
  tl.to(glow, { alpha: 0, duration: 0.3 }, total);
  tl.to(reel.container, {
    y: settled,
    duration: total,
    ease: 'power1.inOut',
    onUpdate: overlay.follow,
  }, 0);
  await Promise.all([new Promise((resolve) => tl.eventCallback('onComplete', resolve)), fit(total)]);

  // Every tween ended on the engine's own positions; snap to be exact.
  reel.motion.snapToGrid();
  for (const view of buffers) view.alpha = 1;
  overlay.box.destroy({ children: true });
  showWays(`Q 1x${h} on reel ${r + 1} splits into ${n}`);
}

// Every stack from `fromReel` on splits, left to right, one at a time.
async function splitStacks(fromReel) {
  for (let r = fromReel; r < reelSet.reels.length; r++) {
    for (let stack = stackOn(r); stack; stack = stackOn(r)) await splitStack(r, stack);
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
    running?.kill();
    gsap.killTweensOf(camera);
    gsap.killTweensOf(camera.scale);
    for (const reel of reelSet.reels) {
      gsap.killTweensOf(reel.container);
      for (const symbol of reel.symbols) {
        gsap.killTweensOf(symbol.view);
        gsap.killTweensOf(symbol.view.scale);
      }
    }
  },
};
