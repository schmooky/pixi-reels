// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, pickWeighted, DebugPlaque,
//                   WinLines, evaluateWays, countWays
//
// Infinity reels that grow both ways. While the win continues the board adds
// a reel to the right, and a wild on a new reel also unlocks a row: every reel
// on the board grows one cell taller, and the reels after it arrive at the new
// height. The camera zooms out to keep the whole board in view.
//
// `reelSet.addRows(1, { cells })` grows the board between the steps of
// `expand()`, in `onStepLanded`, with the server's cells for the new row. The
// next round shrinks back with `removeReels()` and `removeRows()`.
//
// Skip slams the step in flight and turbos the rest. It never fast-forwards:
// an aborted expansion lands every reel still to come in one step, at the
// height the board has then, so it cannot cross a row the server unlocks.

const BASE = 5;
const ROWS = 3;
const MAX_ROWS = 6;
const CELL = 72;
const GAP = 6;
const MAX_EXTRA = 9;
const PAYING = ['A', 'K', 'Q', 'J'];
const W = { '7': 14, '8': 14, '9': 12, '10': 12, J: 10, Q: 9, K: 8, A: 7, wild: 3 };

const reelSet = new ReelSetBuilder()
  .reels(BASE)
  .visibleCells(ROWS)
  .symbolSize(CELL, CELL)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const s of [...CARD_DECK, WILD_CARD]) {
      r.register(s.id, CardSymbol, { color: s.color, label: s.label, textColor: s.textColor });
    }
  })
  .weights(W)
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// --- Camera: a fixed window the board zooms out inside --------------------
const VIEW_W = 660;
const VIEW_H = 300;
const READOUT_H = 64;

const stage = new PIXI.Container();
// Fixed bounds, so the runner fits the window once and the board can grow.
stage.addChild(new PIXI.Graphics().rect(0, 0, VIEW_W, VIEW_H + READOUT_H).fill({ color: 0, alpha: 0 }));
const camera = new PIXI.Container();
const windowMask = new PIXI.Graphics().rect(-4, -4, VIEW_W + 8, VIEW_H + 8).fill(0xffffff);
camera.mask = windowMask;
camera.addChild(reelSet);
stage.addChild(camera, windowMask);

// The board's size comes from the engine: `viewport.maskWidth` grows with each
// reel `expand()` adds, `maskHeight` with each row `addRows()` adds.
function frame() {
  const w = reelSet.viewport.maskWidth;
  const h = reelSet.viewport.maskHeight;
  const scale = Math.min(1, VIEW_W / w, VIEW_H / h);
  return { scale, x: (VIEW_W - w * scale) / 2, y: (VIEW_H - h * scale) / 2 };
}
function fit() {
  const { scale, x, y } = frame();
  return new Promise((resolve) => {
    gsap.to(camera.scale, { x: scale, y: scale, duration: 0.45, ease: 'power2.inOut', overwrite: true });
    gsap.to(camera, { x, y, duration: 0.45, ease: 'power2.inOut', overwrite: true, onComplete: resolve });
  });
}
const start = frame();
camera.scale.set(start.scale);
camera.position.set(start.x, start.y);

// The new row drops in, reel by reel. At rest nothing else moves a symbol, so
// the tween can borrow its view and hand it back where it was.
function revealRow() {
  const row = reelSet.reels[0].visibleCells - 1;
  const views = reelSet.reels.map((reel) => reel.getSymbolAt(row).view);
  return new Promise((resolve) => {
    views.forEach((view, i) => {
      gsap.from(view, {
        alpha: 0,
        y: view.y - CELL * 0.5,
        duration: 0.35,
        delay: i * 0.03,
        ease: 'back.out(1.6)',
        onComplete: i === views.length - 1 ? resolve : undefined,
      });
    });
  });
}

// --- Readout -----------------------------------------------------------
const lines = new WinLines(reelSet, { width: 4 });
const hud = new DebugPlaque({ rows: ['press spin', ''], minWidth: VIEW_W, maxWidth: VIEW_W, reserveRows: 2 });
hud.position.set(0, VIEW_H + 12);
stage.addChild(hud);

function showWays(pay, label) {
  const grid = reelSet.getVisibleGrid();
  const shape = reelSet.reels.map((r) => r.visibleCells);
  const win = evaluateWays(grid, { wilds: ['wild'] }).find((w) => w.symbol === pay);
  lines.clear();
  if (win) lines.ways(win.perReel, { color: 0xffc94a });
  hud.setRows([
    `${label}   ${shape.length} reels x ${shape[0]} rows   board ${countWays(shape).toLocaleString()} ways`,
    win
      ? { text: `${pay} on ${win.reels} reels: ${win.ways.toLocaleString()} ways`, color: 0xffc94a }
      : `no ${pay} win`,
  ]);
}

// --- Server stand-in ----------------------------------------------------
// The base win is forced onto reels 0-2 so the chain is worth watching. A new
// reel is added while the last one still continues the win, and a wild on it
// unlocks a row: the server sends that row's cells for every reel on the board.
const column = (rows, pay, chance) => {
  const cells = Array.from({ length: rows }, () => pickWeighted(W));
  if (Math.random() < chance) cells[Math.floor(Math.random() * rows)] = pay;
  return cells;
};
const continues = (cells, pay) => cells.some((id) => id === pay || id === 'wild');

function serverSpin() {
  const pay = PAYING[Math.floor(Math.random() * PAYING.length)];
  const base = Array.from({ length: BASE }, (_, r) => column(ROWS, pay, r < 3 ? 1 : 0.85));
  const steps = [];
  let rows = ROWS;
  if (base.every((cells) => continues(cells, pay))) {
    while (steps.length < MAX_EXTRA) {
      const cells = column(rows, pay, 0.7);
      if (rows < MAX_ROWS && Math.random() < 0.5) cells[Math.floor(Math.random() * rows)] = 'wild';
      const unlocks = rows < MAX_ROWS && cells.includes('wild');
      const reels = BASE + steps.length + 1;
      steps.push({
        cells,
        row: unlocks ? Array.from({ length: reels }, () => [Math.random() < 0.4 ? pay : pickWeighted(W)]) : null,
      });
      if (unlocks) rows += 1;
      if (!continues(cells, pay)) break;
    }
  }
  return { pay, base, steps };
}

// --- The round ------------------------------------------------------------
async function onSpin() {
  lines.clear();
  if (reelSet.reels.length > BASE || reelSet.reels[0].visibleCells > ROWS) {
    hud.setRows(['back to 5 x 3', '']);
    reelSet.removeReels(); // back to the reels the builder made
    reelSet.removeRows(); // and to its rows
    await fit();
  }

  const res = serverSpin();
  const spin = reelSet.spin();
  await new Promise((r) => setTimeout(r, 150));
  reelSet.setResult(res.base.map((visible) => ({ visible })));
  await spin;
  showWays(res.pay, 'base');
  if (res.steps.length === 0) return;

  await reelSet.expand({
    columns: res.steps.map((s) => ({ visible: s.cells })),
    step: 1,
    onStepAdded: () => fit(),
    onStepLanded: async (step) => {
      showWays(res.pay, `step ${step.index + 1}`);
      const row = res.steps[step.index].row;
      if (!row) return;
      // Between steps nothing spins: the board can grow a row here.
      reelSet.addRows(1, { cells: row });
      await Promise.all([revealRow(), fit()]);
      showWays(res.pay, `wild: row ${reelSet.reels[0].visibleCells}`);
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
    for (const reel of reelSet.reels) for (const symbol of reel.symbols) gsap.killTweensOf(symbol.view);
  },
};
