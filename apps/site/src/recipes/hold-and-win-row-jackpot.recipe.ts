// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, coinWaves, bezierFly,
//           PIXI, gsap, app
//
// Row-complete jackpot. Whenever a coin locks, the game layer checks whether
// it just completed a full row. If it did, that row flashes coin by coin, the
// MINI plaque above the board fires its win, and the row's summed value flies
// up into the plaque. Row detection is pure game logic over
// `board.lockedCoins`; the board has no notion of "rows pay".

const COLS = 5, ROWS = 3, CELL = 70, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-jackpot': '/hw-spine/jackpot.json',
  'hw-panel-mini': '/hw-spine/panel_mini.json',
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
board.container.y = 112;
app.stage.addChild(board.container);

// -- the MINI plaque above the board, fired on a row complete --
const plaquePos = { x: app.screen.width / 2, y: 50 };
const plaque = Spine.from({ skeleton: 'hw-panel-mini', atlas: 'hw-atlas' });
if (plaque.skeleton.data.findAnimation('idle')) { plaque.state.setAnimation(0, 'idle', true); try { plaque.update(0); } catch {} }
const pb = plaque.getLocalBounds();
const pScale = Math.min(70 / Math.max(1, pb.height), 150 / Math.max(1, pb.width));
plaque.scale.set(pScale);
plaque.x = plaquePos.x - (pb.x + pb.width / 2) * pScale;
plaque.y = plaquePos.y - (pb.y + pb.height / 2) * pScale;
app.stage.addChild(plaque);
const awardText = goldText('0.00', 18);
awardText.position.set(plaquePos.x, plaquePos.y + pb.height * pScale * 0.18);
app.stage.addChild(awardText);

const hud = new PIXI.Text({
  text: 'press spin · complete a row for MINI',
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

// -- the jackpot: flash the row, fire the plaque, fly the row sum up --
const flyers = new Set();
const awardedRows = new Set();
let award = 0;
const lockedInRow = (row) => board.lockedCoins.filter((c) => c.cell.row === row);

async function rowJackpot(row) {
  awardedRows.add(row);
  hud.text = `ROW ${row + 1} COMPLETE — MINI!`;
  const rowCoins = lockedInRow(row).sort((a, b) => a.cell.col - b.cell.col);
  if (plaque.skeleton.data.findAnimation('win')) {
    plaque.state.setAnimation(0, 'win', false);
    if (plaque.skeleton.data.findAnimation('idle')) plaque.state.addAnimation(0, 'idle', true, 0);
  }
  // flash each coin in reading order
  for (const wave of coinWaves(rowCoins, 'sequence')) {
    await Promise.all(wave.map((coin) => {
      const k = `${coin.cell.col},${coin.cell.row}`;
      const lbl = labelAt.get(k);
      if (lbl) gsap.fromTo(lbl.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.22, ease: 'back.out(2)' });
      return board.symbolAt(coin.cell).playWin?.().catch?.(() => {}) ?? Promise.resolve();
    }));
    await sleep(70);
  }
  // fly the row sum up into the plaque
  const sum = rowCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
  const mid = abs({ col: (COLS - 1) / 2, row });
  const clone = fitGold(goldText(fmt(sum), 30), CELL, CELL * 0.5);
  clone.position.set(mid.x, mid.y);
  app.stage.addChild(clone);
  flyers.add(clone);
  await bezierFly(clone, mid, plaquePos, { lean: 'up', curvature: 0.3, arriveScale: 0.4, duration: 0.55 });
  flyers.delete(clone);
  try { clone.destroy(); } catch {}
  award += sum;
  awardText.text = fmt(award);
  gsap.fromTo(awardText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
}

const pendingFx = [];
board.events.on('coin:locked', ({ coin }) => {
  paintLabel(coin.cell, coin.data?.value ?? 0);
  const row = coin.cell.row;
  if (!awardedRows.has(row) && lockedInRow(row).length === COLS) {
    pendingFx.push(rowJackpot(row));
  }
});

// Scripted: seed row 1 with four coins, then land the fifth to complete it.
const SEED = [
  { cell: { col: 0, row: 1 }, id: COIN, data: { value: 5 } },
  { cell: { col: 1, row: 1 }, id: COIN, data: { value: 10 } },
  { cell: { col: 2, row: 1 }, id: COIN, data: { value: 5 } },
  { cell: { col: 4, row: 1 }, id: COIN, data: { value: 20 } },
];
const COMPLETE = [{ cell: { col: 3, row: 1 }, id: COIN, data: { value: 10 } }];

const seedBoard = () => {
  board.enter(SEED);
  for (const coin of SEED) paintLabel(coin.cell, coin.data.value);
  hud.text = 'press spin · one coin completes row 2';
};
seedBoard();

let phase = 'ready';
return {
  cleanup: () => {
    for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} }
    flyers.clear();
    for (const t of labelAt.values()) { try { t.destroy(); } catch {} }
    board.destroy();
    plaque.destroy();
  },
  onSpin: async () => {
    if (phase === 'running') return;
    if (phase === 'done') {
      for (const t of labelAt.values()) t.destroy();
      labelAt.clear();
      awardedRows.clear();
      award = 0; awardText.text = '0.00';
      board.reset();
      seedBoard();
      phase = 'ready';
      return;
    }
    phase = 'running';
    await board.respin(COMPLETE);
    await Promise.all(pendingFx.splice(0));
    await sleep(300);
    phase = 'done';
    hud.text = `MINI awarded ${fmt(award)} · press spin to reset`;
  },
};
