// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, DebugPlaque, WinLines,
//                   evaluateWays, countWays
//
// Infinity reels on MultiWays: millions of ways. Every reel lands on its own
// cell count, 2 to 7, so the board's ways are the product of the counts, and
// every reel the expansion adds multiplies them again. Six base reels of
// seven are 117,649 ways; two more steps of two reels each reach 5,764,801
// and then 282,475,249.
//
// Each column's `visible.length` IS that reel's shape: `expand()` applies it
// with `setShape()` for the step, the way a MultiWays spin does. Steps add
// two reels here (`step: 2`). The ways lattice `WinLines` draws stays a few
// dozen segments however many ways it stands for.

const BASE = 6;
const MIN = 2;
const MAX = 7;
const CELL_W = 64;
const EXTENT = 7 * 46;
const GAP = 4;
const WINDOW = 11;
const PAY = 'A';
const IDS = CARD_DECK.map((c) => c.id);

const reelSet = new ReelSetBuilder()
  .reels(BASE)
  .multiways({ minCells: MIN, maxCells: MAX, reelExtent: EXTENT })
  .symbolSize(CELL_W, EXTENT / MAX)
  .symbolGap(GAP, 0)
  .symbols((r) => {
    for (const s of [...CARD_DECK, WILD_CARD]) {
      r.register(s.id, CardSymbol, { color: s.color, label: s.label, textColor: s.textColor });
    }
  })
  .weights(Object.fromEntries([...IDS.map((id) => [id, 10]), ['wild', 2]]))
  // Cells change height every spin; a bounce would overshoot the short ones.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

// --- Camera window --------------------------------------------------------
const PITCH = CELL_W + GAP;
const VIEW_W = WINDOW * PITCH - GAP;
const READOUT_H = 64;
const stage = new PIXI.Container();
stage.addChild(new PIXI.Graphics().rect(0, 0, VIEW_W, EXTENT + READOUT_H).fill({ color: 0, alpha: 0 }));
const camera = new PIXI.Container();
const windowMask = new PIXI.Graphics().rect(-4, -4, VIEW_W + 8, EXTENT + 8).fill(0xffffff);
camera.mask = windowMask;
camera.addChild(reelSet);
stage.addChild(camera, windowMask);
// The board's size comes from the engine: `viewport.maskWidth` grows with
// every reel `expand()` adds and shrinks back with `removeReels()`.
const BUILT_W = reelSet.viewport.maskWidth;
// Centred while the board fits the window, then scrolled so the newest
// reel sits at the right edge.
const cameraX = (width) => (width <= VIEW_W ? (VIEW_W - width) / 2 : VIEW_W - width);
camera.x = cameraX(BUILT_W);
const panTo = (width) =>
  new Promise((resolve) => gsap.to(camera, { x: cameraX(width), duration: 0.35, ease: 'power2.out', onComplete: resolve }));

// Thin and see-through: a 7 x 7 pair of reels is 49 segments.
const lines = new WinLines(reelSet, { width: 1.5, dot: 3, glow: 0, alpha: 0.75 });
const hud = new DebugPlaque({ rows: ['press spin', ''], minWidth: VIEW_W, maxWidth: VIEW_W, reserveRows: 2 });
hud.position.set(0, EXTENT + 12);
stage.addChild(hud);

function show(label) {
  const shape = reelSet.reels.map((r) => r.visibleCells);
  const win = evaluateWays(reelSet.getVisibleGrid(), { wilds: ['wild'] }).find((w) => w.symbol === PAY);
  lines.clear();
  if (win) lines.ways(win.perReel, { color: 0x4ad8ff });
  hud.setRows([
    `${label}   shape ${shape.join('-')}   board ${countWays(shape).toLocaleString()} ways`,
    win
      ? { text: `${PAY} on ${win.reels} reels: ${win.ways.toLocaleString()} ways`, color: 0x4ad8ff }
      : `no ${PAY} win`,
  ]);
}

// --- Server stand-in --------------------------------------------------------
// Tall reels, an A on most of their cells: the point is the ways count, and
// a full board of A makes every way a winning one.
const tall = () => (Math.random() < 0.75 ? MAX : MIN + Math.floor(Math.random() * (MAX - MIN + 1)));
const column = (cells) =>
  Array.from({ length: cells }, () => (Math.random() < 0.8 ? PAY : IDS[Math.floor(Math.random() * IDS.length)]));

async function onSpin() {
  lines.clear();
  if (reelSet.viewport.maskWidth > BUILT_W) {
    await panTo(BUILT_W);
    reelSet.removeReels(); // back to the board the builder made
  }
  const shape = Array.from({ length: BASE }, tall);
  const spin = reelSet.spin();
  reelSet.setShape(shape);
  reelSet.setResult(shape.map((n) => ({ visible: column(n) })));
  await spin;
  show('base');

  // Two steps of two reels: the server decided the board grows to ten.
  const extra = Array.from({ length: 4 }, () => ({ visible: column(tall()) }));
  await reelSet.expand({
    columns: extra,
    step: 2,
    onStepAdded: () => panTo(reelSet.viewport.maskWidth),
    onStepLanded: (step) => show(`step ${step.index + 1}`),
  });
}

return { reelSet, stage, onSpin };
