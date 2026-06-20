// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, SpineReelSymbol, Spine,
//           coinWaves, bezierFly, PIXI, gsap, app
//
// Collector demo. The board starts holding three 5.00 coins. Spin one:
// every free cell respins and a 10.00 lands. Spin again: a collector orb
// lands, and a clone of each coin's VALUE flies into it along a bezier
// arc, ticking the collector's total up on every arrival. The next press
// resets the board back to the opening state with a column-wave sweep.

const COLS = 5, ROWS = 3, CELL = 72, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

// -- Spine assets (idempotent across recipe remounts) --
const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-jackpot': '/hw-spine/jackpot.json',
  'hw-collector': '/hw-spine/collector.json',
};
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) {
    try { PIXI.Assets.add({ alias, src }); } catch {}
  }
}
await PIXI.Assets.load(Object.keys(ASSETS));

const goldText = (text, size) => {
  const t = new PIXI.BitmapText({ text, style: { fontFamily: 'GoldDigits', fontSize: size, letterSpacing: -1 } });
  t.anchor.set(0.5);
  return t;
};

const SETTLE_SIZE = CELL - 10;
const SPINE_MAP = {
  [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' },
  collector: { skeleton: 'hw-collector', atlas: 'hw-atlas' },
};

// fit scales: gold coin at the clean mini_x pose, collector at its idle
const scaleFor = {};
{
  const coinProbe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
  coinProbe.state.setAnimation(0, 'mini_x', true);
  try { coinProbe.update(0); } catch {}
  let b = coinProbe.getLocalBounds();
  scaleFor[COIN] = (CELL - 6) / Math.max(1, b.width, b.height);
  coinProbe.destroy();

  const orbProbe = Spine.from({ skeleton: 'hw-collector', atlas: 'hw-atlas' });
  if (orbProbe.skeleton.data.findAnimation('idle_counter')) orbProbe.state.setAnimation(0, 'idle_counter', true);
  try { orbProbe.update(0); } catch {}
  b = orbProbe.getLocalBounds();
  scaleFor.collector = (CELL + 6) / Math.max(1, b.width, b.height); // the orb may breathe past the cell
  orbProbe.destroy();
}

// -- board --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    r.register(COIN, GoldCoinSymbol, {
      spineMap: SPINE_MAP,
      idleAnimation: 'idle',
      scale: scaleFor[COIN],
      settleSize: SETTLE_SIZE,
    });
    r.register('collector', SpineReelSymbol, {
      spineMap: SPINE_MAP,
      idleAnimation: 'idle_counter',
      winAnimation: 'win',
      landingAnimation: 'fall',
      autoPlayLanding: true,
      scale: scaleFor.collector,
    });
  })
  .weights({ [COIN]: 1, empty: 3, collector: 0 })
  .symbolData({ collector: { unmask: true } }) // its reactions breathe past the cell
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
board.container.y = 64;
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 14);
app.stage.addChild(hud);

// -- value labels + the collector's running total, all event-driven --
const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => {
  const c = board.cellCenter(cell);
  return { x: board.container.x + c.x, y: board.container.y + c.y };
};
// Fit by font size (not scale) so scale-pop tweens stay correct: the
// amount spans the coin face like the source game.
const fitGold = (t, maxW, maxH) => {
  if (t.width > 0 && t.height > 0) {
    const k = Math.min(maxW / t.width, maxH / t.height);
    t.style.fontSize = Math.max(8, Math.floor(t.style.fontSize * k));
  }
  return t;
};
const paintLabel = (coin) => {
  const p = abs(coin.cell);
  const t = fitGold(goldText(fmt(coin.data?.value ?? 0), 32), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(`${coin.cell.col},${coin.cell.row}`, t);
  return t;
};

const pendingFx = [];
let sumText = null;
board.events.on('coin:locked', ({ coin }) => {
  if (coin.data?.collector) {
    // the orb's own total, born at 0.00
    sumText = fitGold(goldText('0.00', 32), SETTLE_SIZE * 0.8, SETTLE_SIZE * 0.42);
    const p = abs(coin.cell);
    sumText.position.set(p.x, p.y);
    labels.addChild(sumText);
    pendingFx.push(sleep(650)); // let the fall + activation read
    return;
  }
  paintLabel(coin);
  pendingFx.push(sleep(450)); // lock flourish
});
board.events.on('coin:released', ({ coin }) => {
  const k = `${coin.cell.col},${coin.cell.row}`;
  labelAt.get(k)?.destroy();
  labelAt.delete(k);
});

// -- scripted scenario --
const SEED = [
  { cell: { col: 0, row: 1 }, id: COIN, data: { value: 5 } },
  { cell: { col: 2, row: 2 }, id: COIN, data: { value: 5 } },
  { cell: { col: 4, row: 0 }, id: COIN, data: { value: 5 } },
];
const HIT_TEN = [{ cell: { col: 3, row: 1 }, id: COIN, data: { value: 10 } }];
const HIT_COLLECTOR = [{ cell: { col: 1, row: 1 }, id: 'collector', data: { collector: true } }];

const seedBoard = () => {
  board.enter(SEED);
  for (const coin of SEED) paintLabel(coin);
};
seedBoard(); // the opening state: three 5.00 coins before any spin

// -- the collect moment: VALUE CLONES fly into the orb over bezier arcs --
const flyers = new Set();
async function collectIntoOrb() {
  const orbCell = HIT_COLLECTOR[0].cell;
  const target = abs(orbCell);
  const valueCoins = board.lockedCoins.filter((c) => !c.data?.collector);
  let sum = 0;
  for (const wave of coinWaves(valueCoins, 'sequence')) {
    await Promise.all(wave.map((coin) => {
      const from = abs(coin.cell);
      const clone = fitGold(goldText(fmt(coin.data.value), 32), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46); // the value itself flies
      clone.position.set(from.x, from.y);
      app.stage.addChild(clone);
      flyers.add(clone);
      return bezierFly(clone, from, target, {
        lean: 'up',
        curvature: 0.4,
        arriveScale: 0.45,
        duration: 0.55,
      }).then(() => {
        flyers.delete(clone);
        try { clone.destroy(); } catch {}
        sum += coin.data.value;
        if (sumText) {
          sumText.text = fmt(sum);
          sumText.style.fontSize = 32; // refit: the digit count grows
          fitGold(sumText, SETTLE_SIZE * 0.8, SETTLE_SIZE * 0.42);
          gsap.fromTo(sumText.scale, { x: 1.45, y: 1.45 }, { x: 1, y: 1, duration: 0.22, ease: 'power2.out' });
        }
      });
    }));
    await sleep(90);
  }
  void board.symbolAt(orbCell).playWin(); // the orb celebrates once the sweep is in — calling it per-arrival restarts 'win' before it can play through
  await sleep(500);
}

// -- the slick reset: column-wave sweep out, reseed, pop back in --
async function slickReset() {
  const sweep = coinWaves(board.lockedCoins, 'by-col');
  for (const wave of sweep) {
    wave.forEach((coin) => {
      const k = `${coin.cell.col},${coin.cell.row}`;
      const label = labelAt.get(k);
      if (label) gsap.to(label.scale, { x: 0, y: 0, duration: 0.16, ease: 'back.in(2)' });
    });
    await sleep(70);
  }
  if (sumText) gsap.to(sumText.scale, { x: 0, y: 0, duration: 0.16, ease: 'back.in(2)' });
  await new Promise((res) => gsap.to(board.container, { alpha: 0, duration: 0.22, ease: 'power2.in', onComplete: res }));

  for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); } catch {} t.destroy(); }
  labelAt.clear();
  if (sumText) { try { gsap.killTweensOf(sumText.scale); sumText.destroy(); } catch {} sumText = null; }
  pendingFx.length = 0;
  board.reset();
  seedBoard();

  // pop back: board fades in, labels arrive in a column wave
  for (const t of labelAt.values()) t.scale.set(0);
  gsap.to(board.container, { alpha: 1, duration: 0.25, ease: 'power2.out' });
  for (const wave of coinWaves(SEED, 'by-col')) {
    wave.forEach((coin) => {
      const label = labelAt.get(`${coin.cell.col},${coin.cell.row}`);
      if (label) gsap.to(label.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2.5)' });
    });
    await sleep(80);
  }
}

let phase = 'ready'; // ready -> done -> (reset) -> ready

return {
  cleanup: () => {
    for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} }
    flyers.clear();
    for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); } catch {} }
    if (sumText) { try { gsap.killTweensOf(sumText.scale); sumText.destroy(); } catch {} }
    pendingFx.length = 0;
    try { gsap.killTweensOf(board.container); } catch {}
    board.destroy();
  },
  onSpin: async () => {
    if (phase === 'done') {
      await slickReset();
      phase = 'ready';
      hud.text = 'press spin';
      return;
    }
    phase = 'running';
    hud.text = 'respin · held cells stay';
    await board.respin(HIT_TEN);            // free cells spin, a 10.00 lands
    await Promise.all(pendingFx.splice(0)); // no new spin while coins animate
    await sleep(350);

    hud.text = 'collector incoming';
    await board.respin(HIT_COLLECTOR);      // free cells spin, the orb lands
    await Promise.all(pendingFx.splice(0));
    await sleep(250);

    hud.text = 'collecting';
    await collectIntoOrb();
    phase = 'done';
    hud.text = 'collected 25.00 · press spin to reset';
  },
};
