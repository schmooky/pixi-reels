// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, coinWaves, bezierFly,
//           PIXI, gsap, app
//
// Collect to a feature meter. The board opens holding value coins; on the
// collect press each coin's amount flies UP out of its cell, shrinks into a
// meter widget above the reels (`arriveScale`), ticks the meter total up and
// fills a progress bar toward a target. The board just hands out cell
// geometry via `cellCenter()` and clears cells with `release()`.

const COLS = 5, ROWS = 3, CELL = 70, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-jackpot': '/hw-spine/jackpot.json',
  'hw-counter': '/hw-spine/counter.json',
};
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));

const goldText = (text, size) => {
  const t = new PIXI.BitmapText({ text, style: { fontFamily: 'GoldDigits', fontSize: size, letterSpacing: -1 } });
  t.anchor.set(0.5);
  return t;
};

const SETTLE_SIZE = CELL - 10;
const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' } };

const scaleFor = {};
{
  const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
  probe.state.setAnimation(0, 'mini_x', true);
  try { probe.update(0); } catch {}
  const b = probe.getLocalBounds();
  scaleFor[COIN] = (CELL - 6) / Math.max(1, b.width, b.height);
  probe.destroy();
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, GoldCoinSymbol, {
    spineMap: SPINE_MAP, idleAnimation: 'idle', scale: scaleFor[COIN], settleSize: SETTLE_SIZE,
  }))
  .weights({ [COIN]: 1, empty: 3 })
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
board.container.y = 116;
app.stage.addChild(board.container);

// -- the feature meter above the reels: spine counter + progress bar + total
const meterPos = { x: app.screen.width / 2, y: 52 };
const counter = Spine.from({ skeleton: 'hw-counter', atlas: 'hw-atlas' });
if (counter.skeleton.data.findAnimation('idle')) { counter.state.setAnimation(0, 'idle', true); try { counter.update(0); } catch {} }
const cb = counter.getLocalBounds();
const cScale = Math.min(64 / Math.max(1, cb.height), 220 / Math.max(1, cb.width));
counter.scale.set(cScale);
counter.x = meterPos.x - (cb.x + cb.width / 2) * cScale;
counter.y = meterPos.y - (cb.y + cb.height / 2) * cScale;
app.stage.addChild(counter);
const playCounter = (name, loop = false) => {
  if (!counter.skeleton.data.findAnimation(name)) return;
  counter.state.setAnimation(0, name, loop);
  if (!loop && counter.skeleton.data.findAnimation('idle')) counter.state.addAnimation(0, 'idle', true, 0);
};

const BAR_W = boardW, BAR_H = 8, TARGET = 100;
const barX = board.container.x, barY = meterPos.y + 34;
const barBg = new PIXI.Graphics().roundRect(barX, barY, BAR_W, BAR_H, 4).fill({ color: 0x000000, alpha: 0.08 });
app.stage.addChild(barBg);
const barFill = new PIXI.Graphics();
app.stage.addChild(barFill);
const drawBar = (frac) => {
  barFill.clear();
  if (frac > 0) barFill.roundRect(barX, barY, Math.max(BAR_H, BAR_W * Math.min(1, frac)), BAR_H, 4).fill({ color: 0xd9a441 });
};
drawBar(0);

const totalText = goldText('0.00', 24);
totalText.position.set(meterPos.x, meterPos.y);
app.stage.addChild(totalText);

const hud = new PIXI.Text({
  text: 'press spin to collect into the meter',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => {
  const c = board.cellCenter(cell);
  return { x: board.container.x + c.x, y: board.container.y + c.y };
};
const fitGold = (t, maxW, maxH) => {
  if (t.width > 0 && t.height > 0) {
    const k = Math.min(maxW / t.width, maxH / t.height);
    t.style.fontSize = Math.max(8, Math.floor(t.style.fontSize * k));
  }
  return t;
};
const paintLabel = (cell, value) => {
  const k = `${cell.col},${cell.row}`;
  labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = fitGold(goldText(fmt(value), 30), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(k, t);
  return t;
};

const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 10 } },
  { cell: { col: 2, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 4, row: 0 }, id: COIN, data: { value: 25 } },
  { cell: { col: 1, row: 1 }, id: COIN, data: { value: 10 } },
  { cell: { col: 3, row: 2 }, id: COIN, data: { value: 15 } },
];
const seedBoard = () => {
  board.enter(SEED);
  for (const coin of SEED) paintLabel(coin.cell, coin.data.value);
  hud.text = 'press spin to collect into the meter';
};
seedBoard();

// -- collect: every value flies UP into the meter, shrinking as it arrives --
const flyers = new Set();
let total = 0;
async function collectToMeter() {
  for (const wave of coinWaves(board.lockedCoins, 'by-row')) {
    await Promise.all(wave.map((coin) => {
      const from = abs(coin.cell);
      const clone = fitGold(goldText(fmt(coin.data.value), 30), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
      clone.position.set(from.x, from.y);
      app.stage.addChild(clone);
      flyers.add(clone);
      const k = `${coin.cell.col},${coin.cell.row}`;
      labelAt.get(k)?.destroy();
      labelAt.delete(k);
      board.release([coin.cell]);
      return bezierFly(clone, from, meterPos, { lean: 'out', around: meterPos, curvature: 0.3, arriveScale: 0.3, duration: 0.55 })
        .then(() => {
          flyers.delete(clone);
          try { clone.destroy(); } catch {}
          total += coin.data.value;
          totalText.text = fmt(total);
          drawBar(total / TARGET);
          playCounter('increment');
          gsap.fromTo(totalText.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.22, ease: 'power2.out' });
        });
    }));
    await sleep(90);
  }
  playCounter('apply');
  await sleep(400);
}

let phase = 'ready';
return {
  cleanup: () => {
    for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} }
    flyers.clear();
    gsap.killTweensOf(totalText.scale);
    for (const t of labelAt.values()) { try { t.destroy(); } catch {} }
    labelAt.clear();
    try { barBg.destroy(); barFill.destroy(); totalText.destroy(); hud.destroy(); labels.destroy(); } catch {}
    board.destroy();
    counter.destroy();
  },
  onSpin: async () => {
    if (phase === 'running') return;
    if (phase === 'done') {
      total = 0; totalText.text = '0.00'; drawBar(0);
      board.reset();
      seedBoard();
      phase = 'ready';
      return;
    }
    phase = 'running';
    hud.text = 'collecting into the meter…';
    playCounter('appear');
    await collectToMeter();
    phase = 'done';
    hud.text = `collected ${fmt(total)} / ${fmt(TARGET)} · press spin to reset`;
  },
};
