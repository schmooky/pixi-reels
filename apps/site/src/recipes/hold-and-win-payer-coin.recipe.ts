// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, SpineReelSymbol, Spine,
//           coinWaves, bezierFly, PIXI, gsap, app
//
// Payer coin. The board opens holding four value coins. Spin once and a
// special payer orb lands; on lock it pumps its value into every other coin
// on the board — a gold token arcs from the orb to each coin in turn, and on
// arrival that coin's amount bumps and flashes. The board stays value-blind:
// the bump is pure game state walked over `board.lockedCoins`.

const COLS = 5, ROWS = 3, CELL = 72, GAP = 6;
const COIN = 'coin', PAYER = 'payer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-jackpot': '/hw-spine/jackpot.json',
  'hw-collector': '/hw-spine/collector.json',
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
const SPINE_MAP = {
  [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' },
  [PAYER]: { skeleton: 'hw-collector', atlas: 'hw-atlas' },
};

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
  scaleFor[PAYER] = (CELL + 6) / Math.max(1, b.width, b.height);
  orbProbe.destroy();
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    r.register(COIN, GoldCoinSymbol, {
      spineMap: SPINE_MAP, idleAnimation: 'idle', scale: scaleFor[COIN], settleSize: SETTLE_SIZE,
    });
    r.register(PAYER, SpineReelSymbol, {
      spineMap: SPINE_MAP, idleAnimation: 'idle_counter', winAnimation: 'win',
      landingAnimation: 'fall', autoPlayLanding: true, scale: scaleFor[PAYER],
    });
  })
  .weights({ [COIN]: 1, empty: 3, [PAYER]: 0 }) // payer is server-placed only
  .symbolData({ [PAYER]: { unmask: true } })    // its reactions breathe past the cell
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
board.container.y = (app.screen.height - boardH) / 2 - 6;
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: 'press spin · payer incoming',
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
  const t = fitGold(goldText(fmt(value), 32), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(k, t);
  return t;
};
const totalOf = () => board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
const refreshHud = (prefix) => { hud.text = `${prefix} · total ${fmt(totalOf())}`; };

// -- the payout: the orb pays its value into every coin, one arc at a time --
const flyers = new Set();
async function payout(payerCell, payValue) {
  const from = abs(payerCell);
  const targets = board.lockedCoins.filter((c) => c.id === COIN);
  for (const wave of coinWaves(targets, 'sequence')) {
    await Promise.all(wave.map((coin) => {
      const token = fitGold(goldText(fmt(payValue), 26), SETTLE_SIZE * 0.7, SETTLE_SIZE * 0.4);
      token.position.set(from.x, from.y);
      app.stage.addChild(token);
      flyers.add(token);
      void board.symbolAt(payerCell).playWin?.(); // orb pulses as it pays
      return bezierFly(token, from, abs(coin.cell), { lean: 'up', curvature: 0.35, arriveScale: 0.6, duration: 0.5 })
        .then(() => {
          flyers.delete(token);
          try { token.destroy(); } catch {}
          coin.data.value += payValue;                       // game state owns the value
          const t = paintLabel(coin.cell, coin.data.value);   // repaint from data
          gsap.fromTo(t.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
          void board.symbolAt(coin.cell).playWin?.().catch?.(() => {}); // the coin flashes
          refreshHud('paid');
        });
    }));
    await sleep(70);
  }
  await sleep(400);
}

const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 2, row: 0 }, id: COIN, data: { value: 10 } },
  { cell: { col: 4, row: 1 }, id: COIN, data: { value: 5 } },
  { cell: { col: 1, row: 2 }, id: COIN, data: { value: 20 } },
];
const PAYER_CELL = { col: 3, row: 2 };
const PAY_VALUE = 5;

const seedBoard = () => {
  board.enter(SEED);
  for (const coin of SEED) paintLabel(coin.cell, coin.data.value);
  refreshHud('held 4');
};
// reset SEED values to their opening amounts (payout mutates them in place)
const OPENING = SEED.map((c) => c.data.value);
const resetSeed = () => SEED.forEach((c, i) => { c.data.value = OPENING[i]; });
seedBoard();

const pendingFx = [];
board.events.on('coin:locked', ({ coin }) => {
  if (coin.id === PAYER) { pendingFx.push(sleep(550)); return; } // let the orb's fall read
  paintLabel(coin.cell, coin.data?.value ?? 0);
});

let phase = 'ready';
return {
  cleanup: () => {
    for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} }
    flyers.clear();
    for (const t of labelAt.values()) { try { t.destroy(); } catch {} }
    board.destroy();
  },
  onSpin: async () => {
    if (phase === 'done') {
      for (const t of labelAt.values()) t.destroy();
      labelAt.clear();
      resetSeed();
      board.reset();
      seedBoard();
      phase = 'ready';
      return;
    }
    phase = 'running';
    hud.text = 'spinning · payer landing';
    await board.respin([{ cell: PAYER_CELL, id: PAYER, data: { payer: true, value: PAY_VALUE } }]);
    await Promise.all(pendingFx.splice(0));
    await sleep(250);

    hud.text = 'the orb pays every coin…';
    await payout(PAYER_CELL, PAY_VALUE);
    phase = 'done';
    hud.text = `paid · total ${fmt(totalOf())} · press spin to reset`;
  },
};
