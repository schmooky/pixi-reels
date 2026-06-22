// @ts-nocheck
// Injected: HoldAndWinBuilder, SpineReelSymbol, Spine, PIXI, gsap, app
//
// Hold & Win on a 5x4 board with the source game's full Spine cast
// (converted 3.7 -> 4.2 via tools/spine-3.7-to-4.2): fruit symbols spin
// past on the strips, gold value coins land with bitmap-font amounts,
// MINI/MAJOR jackpot coins reveal their tier on lock, side plaques
// celebrate, and the collect flight drains the board into the counter.

const COLS = 5, ROWS = 4, CELL = 68, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

// -- assets (idempotent across recipe remounts) --
const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-counter': '/hw-spine/counter.json',
  'hw-jackpot': '/hw-spine/jackpot.json',
  'hw-panel-mini': '/hw-spine/panel_mini.json',
  'hw-panel-minor': '/hw-spine/panel_minor.json',
  'hw-panel-major': '/hw-spine/panel_major.json',
  'hw-panel-grand': '/hw-spine/panel_grand.json',
  'hw-cherry': '/hw-spine/cherry.json',
  'hw-lemon': '/hw-spine/lemon.json',
  'hw-orange': '/hw-spine/orange.json',
  'hw-plum': '/hw-spine/plum.json',
  'hw-grape': '/hw-spine/grape.json',
  'hw-watermelon': '/hw-spine/watermelon.json',
  'hw-bar': '/hw-spine/bar.json',
  'hw-bell': '/hw-spine/bell.json',
};
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) {
    try { PIXI.Assets.add({ alias, src }); } catch {}
  }
}
await PIXI.Assets.load(Object.keys(ASSETS));

// Gold digit BitmapText (the game's own number font: 0-9 , .)
const goldText = (text, size) => {
  const t = new PIXI.BitmapText({ text, style: { fontFamily: 'GoldDigits', fontSize: size, letterSpacing: -1 } });
  t.anchor.set(0.5);
  return t;
};

// -- symbol cast --
// ONE skeleton serves every coin. Its reveal one-shots (`mini`/`major`)
// END on the gold money face (slot jp_coin_top), so the plain value coin
// is that same skeleton posed on the reveal's final frame; its `coin`
// animation (a one-turn coin spin) is the lock flourish and the collect
// flight - all authored Spine, no tween fakery.
//
// The fruit symbols are win-only skeletons: their setup pose IS the static
// face, `idle`/`fall` are missing and no-op. They live on the spin strips
// for base-game flavour and never land (the server only sends coins).
const SPINE_MAP = {
  [COIN]:          { skeleton: 'hw-jackpot', atlas: 'hw-atlas' },
  jackpot_mini:    { skeleton: 'hw-jackpot', atlas: 'hw-atlas' },
  jackpot_major:   { skeleton: 'hw-jackpot', atlas: 'hw-atlas' },
  cherry:          { skeleton: 'hw-cherry', atlas: 'hw-atlas' },
  lemon:           { skeleton: 'hw-lemon', atlas: 'hw-atlas' },
  orange:          { skeleton: 'hw-orange', atlas: 'hw-atlas' },
  plum:            { skeleton: 'hw-plum', atlas: 'hw-atlas' },
  grape:           { skeleton: 'hw-grape', atlas: 'hw-atlas' },
  watermelon:      { skeleton: 'hw-watermelon', atlas: 'hw-atlas' },
  bar:             { skeleton: 'hw-bar', atlas: 'hw-atlas' },
  bell:            { skeleton: 'hw-bell', atlas: 'hw-atlas' },
};

// Jackpot coins land wearing their tier word (`mini_x` loop). The reveal is
// driven on lock (see coin:locked below): the tier anim spins the word off
// and the coin settles on the `coin` money face, where the amount paints in
// the gold font. No `win` mapping - the board's auto playWin() must no-op
// (the skeleton has no 'win' animation) so the reveal owns the moment.
const TIER_OVERRIDES = {
  jackpot_mini: { idle: 'mini_x' },
  jackpot_major: { idle: 'major_x' },
};

// freezeAtEnd / settleMoneyFace / GoldCoinSymbol come from the shared
// holdAndWinFx kit (injected) - see examples/shared/holdAndWinFx.ts.
const SETTLE_SIZE = CELL - 10;

// Skeletons are authored at wildly different sizes - measure each once and
// fit to the cell. Pose first: setup-pose bounds can be degenerate (the
// coin skeleton measures 3px at setup).
const scaleFor = {};
let FLOURISH_MS = 600; // lock-flourish duration, read off the skeleton below
for (const [id, cfg] of Object.entries(SPINE_MAP)) {
  const probe = Spine.from({ skeleton: cfg.skeleton, atlas: cfg.atlas });
  // Coin-skeleton ids all measure at the clean mini_x pose: the money-face
  // frame drags huge fx attachment bounds along and skews the fit.
  const poseName =
    cfg.skeleton === 'hw-jackpot' ? 'mini_x' : (TIER_OVERRIDES[id]?.idle ?? 'idle');
  if (probe.skeleton.data.findAnimation(poseName)) {
    probe.state.setAnimation(0, poseName, true);
  }
  if (cfg.skeleton === 'hw-jackpot') {
    const flourish = probe.skeleton.data.findAnimation('coin');
    if (flourish) FLOURISH_MS = flourish.duration * 1000 + 80;
  }
  try { probe.update(0); } catch {}
  const b = probe.getLocalBounds();
  probe.destroy();
  scaleFor[id] = (CELL - 6) / Math.max(1, b.width, b.height);
}

// -- board --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    for (const id of Object.keys(SPINE_MAP)) {
      r.register(id, id === COIN ? GoldCoinSymbol : SpineReelSymbol, {
        spineMap: SPINE_MAP,
        idleAnimation: 'idle',
        winAnimation: 'win',
        landingAnimation: 'fall',
        autoPlayLanding: true,
        scale: scaleFor[id],
        animations: TIER_OVERRIDES,
        settleSize: SETTLE_SIZE,
      });
    }
  })
  // Strip mix: base-game fruit flavour with the occasional coin flashing
  // past. Jackpot coins are server-placed only - never from random fill.
  .weights({
    [COIN]: 2,
    cherry: 2, lemon: 2, orange: 2, plum: 2, grape: 2,
    watermelon: 1, bar: 1, bell: 1,
    empty: 6,
    jackpot_mini: 0, jackpot_major: 0,
  })
  // Reveal animations expand past the cell: the engine re-parents these to
  // the unmasked container so they can't clip. Server-placed ids only.
  .symbolData({ jackpot_mini: { unmask: true }, jackpot_major: { unmask: true } })
  .respins(3)
  .cellChrome((g, size) => {
    g.roundRect(0, 0, size, size, 10)
      .fill({ color: 0xfaf6ef, alpha: 0.6 })
      .stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = 112;
app.stage.addChild(board.container);

// -- counter widget (their game's counter skeleton) + running total --
const counter = Spine.from({ skeleton: 'hw-counter', atlas: 'hw-atlas' });
if (counter.skeleton.data.findAnimation('idle')) {
  counter.state.setAnimation(0, 'idle', true);
  try { counter.update(0); } catch {}
}
const cb = counter.getLocalBounds();
const cScale = Math.min(72 / Math.max(1, cb.height), 240 / Math.max(1, cb.width));
counter.scale.set(cScale);
const counterPos = { x: app.screen.width / 2, y: 54 };
counter.x = counterPos.x - (cb.x + cb.width / 2) * cScale;
counter.y = counterPos.y - (cb.y + cb.height / 2) * cScale;
app.stage.addChild(counter);
const playCounter = (name, loop = false) => {
  if (!counter.skeleton.data.findAnimation(name)) return;
  counter.state.setAnimation(0, name, loop);
  if (!loop && counter.skeleton.data.findAnimation('idle')) {
    counter.state.addAnimation(0, 'idle', true, 0);
  }
};

const totalText = goldText('0.00', 26);
totalText.position.set(counterPos.x, counterPos.y);
app.stage.addChild(totalText);

// -- the four jackpot plaques, above the reels: MINI MINOR | counter | MAJOR GRAND --
const JACKPOTS = { mini: 100, minor: 250, major: 500, grand: 2500 };
const PANEL_X = { mini: 0.13, minor: 0.32, major: 0.68, grand: 0.87 };
const panels = {};
const panelW = Math.min(120, app.screen.width * 0.17);
for (const [tier, value] of Object.entries(JACKPOTS)) {
  const plaque = Spine.from({ skeleton: `hw-panel-${tier}`, atlas: 'hw-atlas' });
  if (plaque.skeleton.data.findAnimation('idle')) {
    plaque.state.setAnimation(0, 'idle', true);
    try { plaque.update(0); } catch {}
  }
  const pb = plaque.getLocalBounds();
  const pScale = panelW / Math.max(1, pb.width);
  plaque.scale.set(pScale);
  const cx = app.screen.width * PANEL_X[tier];
  const cy = 54;
  plaque.x = cx - (pb.x + pb.width / 2) * pScale;
  plaque.y = cy - (pb.y + pb.height / 2) * pScale;
  app.stage.addChild(plaque);
  const label = goldText(fmt(value), 13);
  // value window: just below the plaque's center line, inside the panel
  label.position.set(cx, cy + pb.height * pScale * 0.06);
  app.stage.addChild(label);
  panels[tier] = { plaque, label };
}
const flashPanel = (tier) => {
  const p = panels[tier];
  if (!p || !p.plaque.skeleton.data.findAnimation('win')) return;
  p.plaque.state.setAnimation(0, 'win', false);
  if (p.plaque.skeleton.data.findAnimation('idle')) p.plaque.state.addAnimation(0, 'idle', true, 0);
};

// -- HUD + per-coin value labels, driven only by board events --
const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);
const refreshHud = () => {
  hud.text = `respins ${board.respinsLeft} · held ${board.lockedCoins.length}/${board.capacity}`;
};
board.events.on('respins:changed', refreshHud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
// Fit by font size (not scale) so scale-pop tweens stay correct: the
// amount spans the coin face like the source game - short values render
// big, long ones shrink to fit.
const fitGold = (t, maxW, maxH) => {
  if (t.width > 0 && t.height > 0) {
    const k = Math.min(maxW / t.width, maxH / t.height);
    t.style.fontSize = Math.max(8, Math.floor(t.style.fontSize * k));
  }
  return t;
};
const paintLabel = (coin) => {
  const c = board.cellCenter(coin.cell);
  const t = fitGold(goldText(fmt(coin.data?.value ?? 0), 32), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
  t.position.set(board.container.x + c.x, board.container.y + c.y);
  labels.addChild(t);
  labelAt.set(`${coin.cell.col},${coin.cell.row}`, t);
};
// Every land effect registers its promise here; the run loop awaits the
// batch before the next respin - no new spin while coins still animate.
const pendingFx = [];
board.events.on('coin:locked', ({ coin }) => {
  refreshHud();
  if (!coin.data?.kind) {
    paintLabel(coin);
    pendingFx.push(sleep(FLOURISH_MS)); // the lock flourish plays out
    return;
  }
  // Jackpot reveal: spin the tier word off, settle on the money face, then
  // paint the amount - the source game's exact under-the-hood sequence.
  flashPanel(coin.data.kind);
  const spine = board.symbolAt(coin.cell).spine;
  if (spine && spine.skeleton.data.findAnimation(coin.data.kind)) {
    // the reveal's final frame IS the money face - settle there on complete
    const entry = spine.state.setAnimation(0, coin.data.kind, false);
    entry.listener = { complete: () => settleMoneyFace(spine, SETTLE_SIZE, coin.data.kind) };
    const delay = ((entry.animation && entry.animation.duration) || 0.6) * 1000 + 80;
    const k = `${coin.cell.col},${coin.cell.row}`;
    pendingFx.push(new Promise((res) => setTimeout(() => {
      // still locked and not replaced by a replay?
      if (board.lockedCoins.some((c) => `${c.cell.col},${c.cell.row}` === k) && !labelAt.has(k)) {
        paintLabel(coin);
      }
      res();
    }, delay)));
  } else {
    paintLabel(coin);
  }
});
board.events.on('coin:released', ({ coin }) => {
  const key = `${coin.cell.col},${coin.cell.row}`;
  labelAt.get(key)?.destroy();
  labelAt.delete(key);
});

// -- collect: released coins arc to the counter, column waves --
const flyers = new Set();
let total = 0;
async function collectAll() {
  // coinWaves picks the choreography: 'by-col' sweeps left to right;
  // 'sequence', 'by-row', 'all' or { chunk: n } are drop-in alternatives.
  for (const wave of coinWaves(board.lockedCoins, 'by-col')) {
    await Promise.all(wave.map((coin, i) => {
      const from = board.cellCenter(coin.cell);
      // every coin flies as the skeleton's own spinning-coin animation
      const fly = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
      fly.scale.set(scaleFor[coin.id] ?? scaleFor[COIN]);
      if (fly.skeleton.data.findAnimation('coin')) fly.state.setAnimation(0, 'coin', true);
      app.stage.addChild(fly);
      flyers.add(fly);
      board.release([coin.cell]); // cell empties under the flying clone
      return bezierFly(
        fly,
        { x: board.container.x + from.x, y: board.container.y + from.y },
        counterPos,
        { lean: 'up', curvature: 0.3, arriveScale: 0.35, delay: i * 0.07 },
      ).then(() => {
        flyers.delete(fly);
        try { fly.destroy(); } catch {}
        total += coin.data?.value ?? 0;
        totalText.text = fmt(total);
        playCounter('increment');
        gsap.fromTo(totalText.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
      });
    }));
  }
  await sleep(500);
}

// -- scripted feature: seeds, two hit waves (one MINI, one MAJOR), then dry
// spins to the end. In a real game the server decides every round; the loop
// runs on result.done.
const SEED = [
  { cell: { col: 1, row: 1 }, id: COIN, data: { value: 25 } },
  { cell: { col: 3, row: 2 }, id: COIN, data: { value: 50 } },
  { cell: { col: 4, row: 0 }, id: COIN, data: { value: 10 } },
];
const ROUNDS = [
  [
    { cell: { col: 0, row: 3 }, id: COIN, data: { value: 20 } },
    { cell: { col: 2, row: 1 }, id: 'jackpot_mini', data: { value: JACKPOTS.mini, kind: 'mini' } },
  ],
  [],
  [{ cell: { col: 4, row: 3 }, id: 'jackpot_major', data: { value: JACKPOTS.major, kind: 'major' } }],
  [], [], [],
];

return {
  cleanup: () => {
    for (const fly of flyers) { try { gsap.killTweensOf(fly); gsap.killTweensOf(fly.scale); fly.destroy(); } catch {} }
    flyers.clear();
    gsap.killTweensOf(totalText.scale);
    for (const { plaque, label } of Object.values(panels)) { try { plaque.destroy(); label.destroy(); } catch {} }
    try { hud.destroy(); labels.destroy(); totalText.destroy(); } catch {}
    labelAt.clear();
    board.destroy();
    counter.destroy();
  },
  onSpin: async () => {
    // reset for replay
    for (const t of labelAt.values()) t.destroy();
    labelAt.clear();
    pendingFx.length = 0;
    total = 0;
    totalText.text = '0.00';
    board.reset();

    playCounter('appear');
    board.enter(SEED);
    // seeds land pre-locked via feature:enter, so they get labels directly
    for (const coin of SEED) paintLabel(coin);
    refreshHud();
    await sleep(500);

    for (const hits of ROUNDS) {
      const result = await board.respin(hits);
      await Promise.all(pendingFx.splice(0)); // land effects finish first
      await sleep(450);
      if (result.done) break;
    }
    await collectAll();
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
  },
};
