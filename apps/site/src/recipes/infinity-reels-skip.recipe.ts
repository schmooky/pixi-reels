// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, gsap, app, pickWeighted, DebugPlaque,
//                   SilkGraphics, roundRectPath
//
// Skip across an expansion: what each press does, logged as it happens.
// Press the button as often as you like during a round and read the log.
//
//   - Reel groups. The base board is grouped `[[0, 1, 2], [3, 4]]` (the
//     dashed boxes), so the first press lands the left block and the second
//     the right one. Every step's reel joins the layout as one more group.
//   - Protected tease. Each step teases its reel, "will the win continue?",
//     with `anticipation: { protect: 'once' }`: the first press during a
//     tease is spent and the tease plays on; the next one lands the reel.
//   - Between steps. A press while the camera pans finds nothing spinning.
//     It is not dropped: it queues (`skip:queued`) and fires the moment the
//     next step has its result. Here every step teases with protection, so
//     the queued press is the one the protection spends, and the next press
//     lands the reel.
//   - The round. The first press that ends a step boosts the rest of the
//     round to the fastest profile (`skip:boosted`); the next round starts
//     at normal speed again.
//
// The button calls `reelSet.skipSpin()` and nothing else: every rule above
// is the engine's.

const BASE = 5;
const ROWS = 3;
const CELL = 76;
const GAP = 6;
const WINDOW = 9;
const PAY = 'Q';
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

// --- Camera window ---------------------------------------------------------
const PITCH = CELL + GAP;
const VIEW_W = WINDOW * PITCH - GAP;
const BOARD_H = ROWS * CELL + (ROWS - 1) * GAP;
const LOG_ROWS = 6;
const READOUT_H = 24 + LOG_ROWS * 16;
const stage = new PIXI.Container();
stage.addChild(new PIXI.Graphics().rect(0, 0, VIEW_W, BOARD_H + READOUT_H).fill({ color: 0, alpha: 0 }));
const camera = new PIXI.Container();
const windowMask = new PIXI.Graphics().rect(-6, -6, VIEW_W + 12, BOARD_H + 12).fill(0xffffff);
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
  new Promise((resolve) => gsap.to(camera, { x: cameraX(width), duration: 0.45, ease: 'power2.out', onComplete: resolve }));

// --- Reel groups, drawn ------------------------------------------------------
const BASE_GROUPS = [[0, 1, 2], [3, 4]];
reelSet.setReelGroups(BASE_GROUPS);
const groupBoxes = new SilkGraphics();
reelSet.addChild(groupBoxes);
function drawGroups() {
  groupBoxes.clear();
  for (const group of reelSet.reelGroups ?? []) {
    const first = reelSet.getCellBounds(Math.min(...group), 0);
    const last = reelSet.getCellBounds(Math.max(...group), ROWS - 1);
    roundRectPath(groupBoxes, first.x - 3, first.y - 3, last.x + last.width - first.x + 6, last.y + last.height - first.y + 6, 8)
      .stroke({ color: 0x9fb4ff, alpha: 0.7, width: 1.5, dash: [6, 4] });
  }
}
drawGroups();
reelSet.events.on('reels:added', drawGroups);
reelSet.events.on('reels:removed', drawGroups);

// --- Press log ---------------------------------------------------------------
const log = [];
const plaque = new DebugPlaque({ rows: ['press spin, then press it again during the round'], minWidth: VIEW_W, maxWidth: VIEW_W, reserveRows: LOG_ROWS + 1 });
plaque.position.set(0, BOARD_H + 12);
stage.addChild(plaque);
let presses = 0;
let noted = 0;
function note(text, color) {
  noted++;
  log.push(color ? { text, color } : text);
  if (log.length > LOG_ROWS) log.shift();
  plaque.setRows([`stage ${reelSet.skipStage}   speed ${reelSet.speed.activeName}   reels ${reelSet.reels.length}`, ...log]);
}
const range = (reels) => (reels.length > 1 ? `r${reels[0]}-${reels[reels.length - 1]}` : `r${reels[0]}`);
// A queued press fires when its step gets a result. If that step teases, the
// protection takes it: nothing lands, and the NEXT press lands the reel.
let queuedAt = null;
const spent = () => {
  if (queuedAt === null) return;
  note(`  press ${queuedAt} was spent on the tease's protection`);
  queuedAt = null;
};
reelSet.events.on('skip:queued', () => {
  queuedAt = presses;
  note(
    reelSet.isSpinning
      ? `press ${presses}: no result yet, queued until it arrives`
      : `press ${presses}: nothing spinning, queued for the next step`,
    0x4ad8ff,
  );
});
reelSet.events.on('skip:requested', (info) => {
  // The queued press itself fired, or a later one did after it was spent.
  if (queuedAt === presses) queuedAt = null;
  else spent();
  note(`press ${presses}: ${info.mode} ${range(info.reels)}${info.partial ? ' (part of the board)' : ''}`);
});
reelSet.events.on('skip:boosted', (info) => note(`  turbo for the rest of the round (${info.previous.name} -> ${info.current.name})`, 0xffc94a));
reelSet.events.on('anticipation:reel', (info) => {
  note(`r${info.reelIndex} teases: will the win continue?`, 0xff5c8a);
  spent();
});

// --- Server stand-in -----------------------------------------------------------
const column = (chance) => {
  const cells = Array.from({ length: ROWS }, () => pickWeighted(W));
  if (Math.random() < chance) cells[Math.floor(Math.random() * ROWS)] = PAY;
  return cells;
};

async function onSpin() {
  presses = 0;
  log.length = 0;
  if (reelSet.viewport.maskWidth > BUILT_W) {
    await panTo(BUILT_W);
    reelSet.removeReels(); // back to the board the builder made
  }
  // A step's reel arrives as its own group; the base layout stays as built.
  reelSet.setReelGroups(BASE_GROUPS);
  note('spinning: press to land the left group, press again for the right');

  const spin = reelSet.spin();
  await new Promise((r) => setTimeout(r, 150));
  reelSet.setResult(Array.from({ length: BASE }, () => ({ visible: column(1) })));
  await spin;

  // Six more reels, one per step, each teased with protection.
  await reelSet.expand({
    columns: Array.from({ length: 6 }, () => ({ visible: column(0.8) })),
    step: 1,
    anticipation: { protect: 'once', duration: 900 },
    onStepAdded: () => panTo(reelSet.viewport.maskWidth),
  });
  note('round over', 0x8cff6b);
}

function onSkip() {
  presses++;
  const before = noted;
  try {
    reelSet.skipSpin();
  } catch {
    // Before the base result arrives there is nothing to land on yet.
    reelSet.requestSkip();
  }
  // A press that freed nothing and queued nothing was spent on a protected
  // tease: the engine says so by doing nothing, so say it here.
  if (noted === before) note(`press ${presses}: the tease is protected, it plays on`);
}

return { reelSet, stage, onSpin, onSkip };
