// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, pickWeighted, DebugPlaque,
//                   WinLines, evaluateWays, countWays
//
// Infinity reels. The base 5x3 spin lands; while the win still runs into the
// last reel, the server adds another reel to its result, and the board grows
// sideways one reel at a time: add it, pan to it, spin it, land it, count the
// ways, repeat. How many reels the round ends with is the server's call.
//
// `reelSet.expand({ columns, step })` is the whole chain. Every earlier reel
// is held while a step spins, so only the new reel moves. The steps are one
// round: the first skip press slams the step in flight and turbos the rest
// (the same boost `skipSpin()` gives the rest of any round), and a second
// press aborts the expansion's signal, which lands every reel still to come
// in one step. The next spin removes the extra reels again.
//
// The ways math (`evaluateWays`, `countWays`) is a stand-in for the server:
// the library never computes wins. `WinLines` draws the winning ways as a
// lattice: every winning cell joined to every winning cell on the next reel.

const BASE = 5;
const ROWS = 3;
const CELL = 84;
const GAP = 6;
// How many reels the camera window shows. The board starts centred in it and
// scrolls once it outgrows it.
const WINDOW = 8;
const MAX_EXTRA = 14;
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

// --- Camera: a fixed window the board scrolls inside ---------------------
const PITCH = CELL + GAP;
const VIEW_W = WINDOW * PITCH - GAP;
const BOARD_H = ROWS * CELL + (ROWS - 1) * GAP;
const READOUT_H = 64;

const stage = new PIXI.Container();
// Fixed bounds, so the runner fits the window once and the board can grow.
stage.addChild(new PIXI.Graphics().rect(0, 0, VIEW_W, BOARD_H + READOUT_H).fill({ color: 0, alpha: 0 }));
const camera = new PIXI.Container();
const windowMask = new PIXI.Graphics().rect(-4, -4, VIEW_W + 8, BOARD_H + 8).fill(0xffffff);
camera.mask = windowMask;
camera.addChild(reelSet);
stage.addChild(camera, windowMask);

const boardWidth = (reels) => reels * PITCH - GAP;
const cameraX = (reels) =>
  boardWidth(reels) <= VIEW_W ? (VIEW_W - boardWidth(reels)) / 2 : VIEW_W - boardWidth(reels);
camera.x = cameraX(BASE);

function panTo(reels) {
  return new Promise((resolve) => {
    gsap.to(camera, { x: cameraX(reels), duration: 0.35, ease: 'power2.out', onComplete: resolve });
  });
}

// --- Readout -----------------------------------------------------------
const lines = new WinLines(reelSet, { width: 4 });
const hud = new DebugPlaque({ rows: ['press spin', ''], minWidth: VIEW_W, maxWidth: VIEW_W, reserveRows: 2 });
hud.position.set(0, BOARD_H + 12);
stage.addChild(hud);

function showWays(pay, label) {
  const grid = reelSet.getVisibleGrid();
  const total = countWays(reelSet.reels.map((r) => r.visibleCells));
  const win = evaluateWays(grid, { wilds: ['wild'] }).find((w) => w.symbol === pay);
  lines.clear();
  if (win) lines.ways(win.perReel, { color: 0xffc94a });
  hud.setRows([
    `${label}   reels ${reelSet.reels.length}   board ${total.toLocaleString()} ways`,
    win
      ? { text: `${pay} on ${win.reels} reels: ${win.ways.toLocaleString()} ways`, color: 0xffc94a }
      : `no ${pay} win`,
  ]);
}

// --- Server stand-in ----------------------------------------------------
// The base win is forced onto reels 0-2 so the chain is worth watching. The
// rule that grows the board is the server's: a new reel is added while the
// last one still continues the win; the reel that breaks it is still shown.
const column = (pay, chance) => {
  const cells = Array.from({ length: ROWS }, () => pickWeighted(W));
  if (Math.random() < chance) cells[Math.floor(Math.random() * ROWS)] = pay;
  return cells;
};
const continues = (cells, pay) => cells.some((id) => id === pay || id === 'wild');

function serverSpin() {
  const pay = PAYING[Math.floor(Math.random() * PAYING.length)];
  const base = Array.from({ length: BASE }, (_, r) => column(pay, r < 3 ? 1 : 0.85));
  const extra = [];
  if (base.every((cells) => continues(cells, pay))) {
    while (extra.length < MAX_EXTRA) {
      const cells = column(pay, 0.75);
      extra.push(cells);
      if (!continues(cells, pay)) break;
    }
  }
  return { pay, base, extra };
}

// --- The round ------------------------------------------------------------
let expanding = null;

async function onSpin() {
  lines.clear();
  if (reelSet.reels.length > BASE) {
    hud.setRows(['back to five reels', '']);
    await panTo(BASE);
    reelSet.removeReels(reelSet.reels.length - BASE);
  }

  const res = serverSpin();
  const spin = reelSet.spin();
  await new Promise((r) => setTimeout(r, 150));
  reelSet.setResult(res.base.map((visible) => ({ visible })));
  await spin;
  showWays(res.pay, 'base');
  if (res.extra.length === 0) return;

  expanding = new AbortController();
  try {
    await reelSet.expand({
      columns: res.extra.map((visible) => ({ visible })),
      step: 1,
      signal: expanding.signal,
      onAdded: (step) => panTo(step.reelCount),
      onLanded: (step) => showWays(res.pay, step.fastForward ? 'fast-forward' : `step ${step.index + 1}`),
    });
  } finally {
    expanding = null;
  }
}

function onSkip() {
  // During the chain: the first press frees the step and turbos the rest,
  // even pressed mid-pan (the press carries to the next step). Once the round
  // is skipped, the next press fast-forwards to the final board.
  if (expanding) {
    if (reelSet.skipStage < 2) reelSet.skipSpin();
    else expanding.abort();
    return;
  }
  try {
    reelSet.skipSpin();
  } catch {
    reelSet.requestSkip();
  }
}

return { reelSet, stage, onSpin, onSkip };
